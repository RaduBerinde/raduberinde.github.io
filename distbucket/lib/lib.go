package lib

import (
	"errors"
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

	Error string
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

func Test() (int, error) {
	return 1, errors.New("lol")
}

func throw(format string, args ...interface{}) {
	panic(fmt.Errorf(format, args...))
}

// Process takes the input parameters and generates the output graphs.
func Process(inputYAML string) (result Output) {
	// Catch any errors.
	defer func() {
		if obj := recover(); obj != nil {
			if err, isErr := obj.(error); isErr {
				result = Output{
					Error: err.Error(),
				}
			}
		}
	}()

	input := Input{
		Config: DefaultConfig,
	}
	if err := yaml.UnmarshalStrict([]byte(inputYAML), &input); err != nil {
		throw("Error parsing input YAML: %v\n", err)
	}
	cfg := &input.Config
	if cfg.TargetRefillPeriodSecs != 0 {
		cfg.TargetRefillPeriod = time.Duration(cfg.TargetRefillPeriodSecs * float64(time.Second))
	}
	if cfg.QueuedTimeScaleSecs != 0 {
		cfg.QueuedTimeScale = time.Duration(cfg.QueuedTimeScaleSecs * float64(time.Second))
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

	grantedDist, tokensDist := DistTokenBucket3(cfg, requested)
	aggregateDist := grantedDist.Aggregate(cfg)

	grantedIdeal, tokensIdeal := TokenBucket(cfg, requested)
	aggregateIdeal := grantedIdeal.Aggregate(cfg)

	var graphMax float64
	for _, v := range aggregateRequested {
		graphMax = math.Max(graphMax, v)
	}
	//for _, v := range aggregateDist {
	//	graphMax = math.Max(graphMax, v)
	//}
	//for _, v := range aggregateIdeal {
	//	graphMax = math.Max(graphMax, v)
	//}

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
				FixedRange: []float64{0, graphMax},
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
				FixedRange: []float64{0, graphMax},
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
				FixedRange: []float64{0, graphMax},
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
