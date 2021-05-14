package lib

import (
	"fmt"

	"gopkg.in/yaml.v2"
)

// This struct is the input to the library.
type Input struct {
	Config Config
	Nodes  []WorkloadDesc
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

	nodes := make([]Workload, len(input.Nodes))
	for i := range nodes {
		nodes[i] = MakeWorkload(input.Config, input.Nodes[i])
	}

	sum := ZeroWorkload(input.Config)
	for i := range nodes {
		sum = sum.Sum(&nodes[i])
	}

	nodeSeries := make([]Series, len(nodes))
	for i := range nodeSeries {
		nodeSeries[i] = Series{
			Name:  fmt.Sprintf("n%d", i+1),
			Unit:  "RU/s",
			Width: 1,
			Data:  nodes[i].Data,
		}
	}

	out := Output{
		TimeAxis: input.Config.TimeAxis(),
	}

	out.Charts = append(out.Charts, Chart{
		Title: "Requested",
		Units: []string{"RU/s"},
		Series: append(nodeSeries, Series{
			Name:  "aggregate",
			Unit:  "RU/s",
			Width: 2,
			Data:  sum.Data,
		}),
	})

	tokenBucketPerNode, tokenBucketAggregate, tokens := DistTokenBucket(input.Config, nodes)
	nodeSeries = make([]Series, len(nodes))
	for i := range nodeSeries {
		w := tokenBucketPerNode[i]
		if input.Config.Smoothing {
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

	tokenBucketPerNode, tokenBucketAggregate, tokens = TokenBucket(input.Config, nodes)

	nodeSeries = make([]Series, len(nodes))
	for i := range nodeSeries {
		w := tokenBucketPerNode[i]
		if input.Config.Smoothing {
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
		Title: "Granted (perfect token bucket)",
		Units: []string{"RU/s", "RU"},
		Series: append(nodeSeries,
			Series{
				Name:  "aggregate",
				Unit:  "RU/s",
				Width: 2.5,
				Data:  tokenBucketAggregate.Data,
			},
			Series{
				Name:  "tokens",
				Unit:  "RU",
				Width: 0.5,
				Data:  tokens.Data,
			},
		),
	})
	return out

}
