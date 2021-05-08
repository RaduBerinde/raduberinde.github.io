package lib

import "fmt"

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
	Series []Series
}

type Series struct {
	Name string
	Data []float64
}

// Process takes the input parameters and generates the output graphs.
func Process(input Input) Output {
	nodes := make([]Workload, len(input.Nodes))
	for i := range nodes {
		nodes[i] = MakeWorkload(input.Config, input.Nodes[i])
	}

	sum := ZeroWorkload(input.Config)
	for _, w := range nodes {
		sum = sum.Sum(w)
	}

	tokenBucketOutput, tokens := TokenBucket(nodes)

	out := Output{
		TimeAxis: input.Config.TimeAxis(),
	}

	nodeSeries := make([]Series, len(nodes))
	for i := range nodes {
		nodeSeries[i].Name = fmt.Sprintf("node %d", i+1)
		nodeSeries[i].Data = nodes[i].Data
	}
	out.Charts = []Chart{
		{
			Title:  "Requested per node",
			Series: nodeSeries,
		},
		{
			Title: "Requested aggregate",
			Series: []Series{{
				Name: "aggregate",
				Data: sum.Data,
			}},
		},
		{
			Title: "Perfect token bucket",
			Series: []Series{
				{
					Name: "aggregate",
					Data: tokenBucketOutput.Data,
				},
				{
					Name: "tokens",
					Data: tokens.Data,
				},
			},
		},
	}
	return out
}
