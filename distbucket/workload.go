package main

import (
	"fmt"
	"math"
	"time"
)

type Workload struct {
	Config Config
	Data   []float64
}

// A Workload is a sum of various simple functions.
type WorkloadDesc struct {
	Funcs []Func
}

type Func struct {
	// Type is one of those in the switch in AddFunc.
	Type string

	Start    float64
	Duration float64

	// Used for "constant"
	Value float64

	// Used for "ramp"
	Delta float64

	// Used for "sine"
	Period float64
	Peak   float64
}

func (w *Workload) AddFunc(f Func) {
	convTime := func(v float64) int {
		d := time.Duration(v * float64(time.Second))
		if d < 0 {
			d = w.Config.Timeframe - d
		}
		if d < 0 || d > w.Config.Timeframe {
			panic(fmt.Sprintf("time %v out of range", v))
		}
		return w.Config.TickForTime(time.Duration(v * float64(time.Second)))
	}
	startTick := convTime(f.Start)
	endTick := w.Config.NumTicks()
	if f.Duration != 0 {
		endTick = convTime(f.Start + f.Duration)
	}

	switch f.Type {
	case "constant":
		for i := startTick; i < endTick; i++ {
			w.Data[i] += f.Value
		}

	case "ramp":
		for i := startTick; i < endTick; i++ {
			w.Data[i] += f.Delta * float64(i-startTick) / float64(endTick-startTick)
		}

		for i := endTick; i < len(w.Data); i++ {
			w.Data[i] += f.Delta
		}

	case "sine":
		period := convTime(f.Period)

		for i := startTick; i < endTick; i++ {
			w.Data[i] = f.Peak * (0.5 + 0.5*math.Sin(-0.5*math.Pi+2*math.Pi*float64(i-startTick)/float64(period)))
		}

	default:
		panic(fmt.Sprintf("func type '%s' not supported", f.Type))
	}
}

func ZeroWorkload(config Config) Workload {
	return Workload{
		Config: config,
		Data:   make([]float64, config.NumTicks()),
	}
}

func MakeWorkload(config Config, desc WorkloadDesc) Workload {
	w := ZeroWorkload(config)
	for _, f := range desc.Funcs {
		w.AddFunc(f)
	}

	return w
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
