package lib

import (
	"fmt"

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
	Units  []string
	Series []Series
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

	requested := MakePerNodeData(cfg, len(input.Nodes))
	for i := range requested {
		requested[i] = DataFromFuncDesc(cfg, input.Nodes[i])
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
		Units: []string{"RU/s"},
		Series: append(nodeSeries, Series{
			Name:  "aggregate",
			Unit:  "RU/s",
			Width: 2,
			Data:  requested.Aggregate(cfg),
		}),
	})

	/*
		grantedPerNode, tokenBucketAggregate, tokens := DistTokenBucket(cfg, nodes)
		nodeSeries = make([]Series, len(nodes))
		for i := range nodeSeries {
			w := tokenBucketPerNode[i]
			if cfg.Smoothing {
				w = w.Smooth(0.1)
			}
			nodeSeries[i] = Series{
				Name:  fmt.Sprintf("n%d", i+1),
				Unit:  "RU/s",
				Width: 1,
				Data:  w.Data,
			}
		}

		out.Charts = append(out.Charts, Chart{
			Title: "Granted (distributed token bucket)",
			Units: []string{"RU/s", "RU"},
			Series: append(nodeSeries,
				Series{
					Name:  "aggregate",
					Unit:  "RU/s",
					Width: 2.5,
					Data:  tokenBucketAggregate.Data,
				},
				Series{
					Name:  "global tokens",
					Unit:  "RU",
					Width: 0.5,
					Data:  tokens.Data,
				},
			),
		})
	*/

	granted, tokens := TokenBucket(cfg, requested)

	nodeSeries = make([]Series, len(requested))
	for i := range nodeSeries {
		g := granted[i]
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
		Title: "Granted (perfect token bucket)",
		Units: []string{"RU/s", "RU"},
		Series: append(nodeSeries,
			Series{
				Name:  "aggregate",
				Unit:  "RU/s",
				Width: 2.5,
				Data:  granted.Aggregate(cfg),
			},
			Series{
				Name:  "tokens",
				Unit:  "RU",
				Width: 0.5,
				Data:  tokens,
			},
		),
	})
	return out

}
