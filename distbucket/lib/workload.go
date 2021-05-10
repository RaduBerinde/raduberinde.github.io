package lib

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

	Value float64 // used for "constant"

	Delta float64 // used for "ramp"

	Period    float64 // used for "sine"
	Amplitude float64 // used for "sine" and "gaussian"
}

func (w *Workload) AddFunc(f Func) {
	convTime := func(v float64) int {
		return w.Config.TickForTime(time.Duration(v * float64(time.Second)))
	}
	convTimeCheck := func(v float64) int {
		d := time.Duration(v * float64(time.Second))
		if d < 0 || d > w.Config.Timeframe {
			panic(fmt.Sprintf("time %v out of range", v))
		}
		return w.Config.TickForTime(time.Duration(v * float64(time.Second)))
	}
	startTick := convTimeCheck(f.Start)
	endTick := w.Config.NumTicks()
	if f.Duration != 0 {
		if end := convTime(f.Start + f.Duration); end < endTick {
			endTick = end
		}
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
		period := w.Config.TickForTime(time.Duration(f.Period * float64(time.Second)))

		for i := startTick; i < endTick; i++ {
			w.Data[i] = f.Amplitude * (0.5 + 0.5*math.Sin(-0.5*math.Pi+2*math.Pi*float64(i-startTick)/float64(period)))
		}

	case "gaussian":
		// A Gaussian is of the form:
		//             (x - b)^2
		//   a * exp(- ----------)
		//               2c^2)
		a := f.Amplitude
		b := f.Start + 0.5*f.Duration
		// We want Duration to be the width at 1% of maximum: 2*sqrt(2*ln(100)).
		c := f.Duration / (2 * math.Sqrt(2*math.Log(100)))

		for i := range w.Data {
			delta := (w.Config.TimeForTick(i).Seconds() - b)
			w.Data[i] += a * math.Exp(-0.5*delta*delta/(c*c))
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

func (w *Workload) Copy() Workload {
	res := ZeroWorkload(w.Config)
	copy(res.Data, w.Data)
	return res
}

func (w *Workload) Sum(other *Workload) Workload {
	if w.Config != other.Config {
		panic("different configs")
	}
	res := w.Copy()
	for i := range res.Data {
		res.Data[i] = w.Data[i] + other.Data[i]
	}
	return res
}

func (w *Workload) Smooth(alpha float64) Workload {
	res := ZeroWorkload(w.Config)
	if len(w.Data) == 0 {
		return res
	}
	for i := range w.Data {
		if i == 0 {
			res.Data[0] = w.Data[0]
			continue
		}
		res.Data[i] = (1-alpha)*res.Data[i-1] + alpha*w.Data[i]
	}

	/*
		l, r := 0, 0
		// Sum of w.Data[l:r].
		sum := w.Data[0]
		for i := range w.Data {
			for ; l < i-window/2; l++ {
				sum -= w.Data[l]
			}
			for ; r < i+(window+1)/2 && r < len(w.Data); r++ {
				sum += w.Data[r]
			}
			res.Data[i] = sum / float64(r-l)
		}
	*/
	return res
}
