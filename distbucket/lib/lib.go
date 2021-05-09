package lib

import "fmt"
import "gopkg.in/yaml.v2"


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
	Unit string
	Data []float64
}

// Process takes the input parameters and generates the output graphs.
func Process(inputYAML string) Output {
	input := Input {
		Config: DefaultConfig,
	}
	if err := yaml.UnmarshalStrict([]byte(inputYAML), &input); err != nil {
		panic(err)
	}

	nodes := make([]Workload, len(input.Nodes))
	for i := range nodes {
		nodes[i] = MakeWorkload(input.Config, input.Nodes[i])
	}

	sum := ZeroWorkload(input.Config)
	for i := range nodes {
		sum = sum.Sum(&nodes[i])
	}

	tokenBucketOutput, tokens := TokenBucket(nodes)

	out := Output{
		TimeAxis: input.Config.TimeAxis(),
	}

	nodeSeries := make([]Series, len(nodes))
	for i := range nodes {
		nodeSeries[i] = Series{
			Name: fmt.Sprintf("node %d", i+1),
			Unit: "RU/s",
			Data: nodes[i].Data,
		}
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
				Unit: "RU/s",
				Data: sum.Data,
			}},
		},
		{
			Title: "Perfect token bucket",
			Series: []Series{
				{
					Name: "aggregate",
					Unit: "RU/s",
					Data: tokenBucketOutput.Data,
				},
				{
					Name: "tokens",
					Unit: "RU",
					Data: tokens.Data,
				},
			},
		},
	}
	return out
}
