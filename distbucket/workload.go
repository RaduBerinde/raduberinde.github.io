package main

import (
	"fmt"
)

type Workload struct {
	Config Config
	Data   []float64
}

type WorkloadDesc struct {
	Type          string
	Baseline      float64
	RampPerSecond float64 `yaml:"ramp_per_second"`
}

func MakeWorkload(config Config, desc WorkloadDesc) Workload {
	res := Workload{
		Config: config,
		Data:   make([]float64, config.NumTicks()),
	}
	switch desc.Type {
	case "linear":
		for i := range res.Data {
			res.Data[i] = desc.Baseline + desc.RampPerSecond*config.TimeForTick(i).Seconds()
		}

	default:
		panic(fmt.Sprintf("workload type '%s' not supported", desc.Type))
	}

	return res
}

func (w Workload) Sum(other Workload) Workload {
	if w.Config != other.Config {
		panic("different configs")
	}
	res := Workload{
		Config: w.Config,
		Data:   make([]float64, len(w.Data)),
	}
	for i := range res.Data {
		res.Data[i] = w.Data[i] + other.Data[i]
	}
	return res
}
