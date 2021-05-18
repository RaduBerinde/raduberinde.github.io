package lib

import (
	"fmt"
	"math"
	"time"

	"gopkg.in/yaml.v2"
)

// This struct is the input to the library.
type Input struct {
	Config Config
	Nodes  []FuncDesc
}

// This struct is the output of the library.
type Output struct {
	TimeAxis []float64

	Charts []Chart
}

type Chart struct {
	Title  string
	Units  []Unit
	Series []Series
}

type Unit struct {
	Name       string
	FixedRange []float64
}

type Series struct {
	Name  string
	Unit  string
	Width float64
	Data  []float64
}

// Process takes the input parameters and generates the output graphs.
func Process(inputYAML string) Output {
	input := Input{
		Config: DefaultConfig,
	}
	if err := yaml.UnmarshalStrict([]byte(inputYAML), &input); err != nil {
		fmt.Printf("Error parsing input YAML: %v\n", err)
		return Output{}
	}
	cfg := &input.Config
	if cfg.TargetRefillPeriodSecs != 0 {
		cfg.TargetRefillPeriod = time.Duration(cfg.TargetRefillPeriodSecs * float64(time.Second))
	}

	requested := MakePerNodeData(cfg, len(input.Nodes))
	for i := range requested {
		requested[i] = DataFromFuncDesc(cfg, input.Nodes[i])
		for j := range requested[i] {
			if requested[i][j] < 0 {
				requested[i][j] = 0
			}
		}
	}
	aggregateRequested := requested.Aggregate(cfg)

	grantedDist, tokensDist := DistTokenBucket(cfg, requested)
	aggregateDist := grantedDist.Aggregate(cfg)

	grantedIdeal, tokensIdeal := TokenBucket(cfg, requested)
	aggregateIdeal := grantedIdeal.Aggregate(cfg)

	var max float64
	for _, v := range aggregateRequested {
		max = math.Max(max, v)
	}
	for _, v := range aggregateDist {
		max = math.Max(max, v)
	}
	for _, v := range aggregateIdeal {
		max = math.Max(max, v)
	}

	nodeSeries := make([]Series, len(requested))
	for i := range nodeSeries {
		nodeSeries[i] = Series{
			Name:  fmt.Sprintf("n%d", i+1),
			Unit:  "RU/s",
			Width: 1,
			Data:  requested[i],
		}
	}

	out := Output{
		TimeAxis: cfg.TimeAxis(),
	}

	out.Charts = append(out.Charts, Chart{
		Title: "Requested",
		Units: []Unit{
			{
				Name:       "RU/s",
				FixedRange: []float64{0, max},
			},
		},
		Series: append(nodeSeries, Series{
			Name:  "aggregate",
			Unit:  "RU/s",
			Width: 2,
			Data:  aggregateRequested,
		}),
	})

	nodeSeries = make([]Series, len(requested))
	for i := range nodeSeries {
		g := grantedDist[i]
		if cfg.Smoothing {
			g = g.Smooth(cfg, 0.1)
		}
		nodeSeries[i] = Series{
			Name:  fmt.Sprintf("n%d", i+1),
			Unit:  "RU/s",
			Width: 1,
			Data:  g,
		}
	}

	out.Charts = append(out.Charts, Chart{
		Title: "Granted (distributed token bucket)",
		Units: []Unit{
			{
				Name:       "RU/s",
				FixedRange: []float64{0, max},
			},
			{
				Name: "RU",
			},
		},
		Series: append(nodeSeries,
			Series{
				Name:  "aggregate",
				Unit:  "RU/s",
				Width: 2.5,
				Data:  aggregateDist,
			},
			Series{
				Name:  "global tokens",
				Unit:  "RU",
				Width: 0.5,
				Data:  tokensDist,
			},
		),
	})

	nodeSeries = make([]Series, len(requested))
	for i := range nodeSeries {
		g := grantedIdeal[i]
		if cfg.Smoothing {
			g = g.Smooth(cfg, 0.1)
		}
		nodeSeries[i] = Series{
			Name:  fmt.Sprintf("n%d", i+1),
			Unit:  "RU/s",
			Width: 1,
			Data:  g,
		}
	}

	out.Charts = append(out.Charts, Chart{
		Title: "Granted (ideal token bucket)",
		Units: []Unit{
			{
				Name:       "RU/s",
				FixedRange: []float64{0, max},
			},
			{
				Name: "RU",
			},
		},
		Series: append(nodeSeries,
			Series{
				Name:  "aggregate",
				Unit:  "RU/s",
				Width: 2.5,
				Data:  aggregateIdeal,
			},
			Series{
				Name:  "tokens",
				Unit:  "RU",
				Width: 0.5,
				Data:  tokensIdeal,
			},
		),
	})

	// Generate total granted graphs.
	totalDist := ZeroData(cfg)
	var sum float64
	for i := range totalDist {
		sum += aggregateDist[i]
		totalDist[i] = sum
	}
	totalIdeal := ZeroData(cfg)
	sum = 0
	for i := range totalIdeal {
		sum += aggregateIdeal[i]
		totalIdeal[i] = sum
	}
	out.Charts = append(out.Charts, Chart{
		Title: "Total granted (vs ideal)",
		Units: []Unit{
			{
				Name: "RU",
			},
		},
		Series: []Series{
			{
				Name:  "distributed",
				Unit:  "RU",
				Width: 1,
				Data:  totalDist,
			},
			{
				Name:  "ideal",
				Unit:  "RU",
				Width: 1,
				Data:  totalIdeal,
			},
		},
	})

	return out
}
