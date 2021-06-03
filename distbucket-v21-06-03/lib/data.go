package lib

import (
	"fmt"
	"math"
	"math/rand"
	"time"
)

// Data represents an arbitrary function with one value per tick.
type Data []float64

func ZeroData(cfg *Config) Data {
	return make([]float64, cfg.NumTicks())
}

func (d Data) Copy(cfg *Config) Data {
	res := ZeroData(cfg)
	copy(res, d)
	return res
}

func (d Data) Scale(factor float64) {
	for i := range d {
		d[i] *= factor
	}
}

func DataSum(cfg *Config, d ...Data) Data {
	res := ZeroData(cfg)
	for i := range d {
		for j := range d[i] {
			res[j] += d[i][j]
		}
	}
	return res
}

// Smooth applies exponential smoothing to the function;
// alpha is in the range (0,1], with 1 being no smoothing.
func (w Data) Smooth(cfg *Config, alpha float64) Data {
	res := ZeroData(cfg)
	if len(w) == 0 {
		return res
	}
	for i := range w {
		if i == 0 {
			res[0] = w[0]
			continue
		}
		res[i] = (1-alpha)*res[i-1] + alpha*w[i]
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

// A FuncDesc is used to define a function using user-friendly building blocks.
// The function is a sum of terms.
type FuncDesc struct {
	Terms []FuncTerm
}

// FuncTerm defines one term of a function.
type FuncTerm struct {
	// Type is one of those in the switch in AddFunc.
	Type string

	Start    float64
	Duration float64

	Value float64 // used for "constant"

	Delta float64 // used for "ramp"

	Period    float64 // used for "sine"
	Amplitude float64 // used for "sine" and "gaussian"

	Smoothness int // used for "noise"
}

func (s Data) AddFuncTerm(cfg *Config, f FuncTerm) {
	convTime := func(v float64) int {
		return cfg.TickForTime(time.Duration(v * float64(time.Second)))
	}
	convTimeCheck := func(v float64) int {
		d := time.Duration(v * float64(time.Second))
		if d < 0 || d > cfg.Timeframe {
			throw(fmt.Sprintf("time %v out of range", v))
		}
		return cfg.TickForTime(time.Duration(v * float64(time.Second)))
	}
	startTick := convTimeCheck(f.Start)
	endTick := cfg.NumTicks()
	if f.Duration != 0 {
		if end := convTime(f.Start + f.Duration); end < endTick {
			endTick = end
		}
	}

	switch f.Type {
	case "constant":
		for i := startTick; i < endTick; i++ {
			s[i] += f.Value
		}

	case "ramp":
		for i := startTick; i < endTick; i++ {
			s[i] += f.Delta * float64(i-startTick) / float64(endTick-startTick)
		}

		for i := endTick; i < len(s); i++ {
			s[i] += f.Delta
		}

	case "sine":
		if f.Period <= 0 {
			throw("invalid sine period")
		}
		period := cfg.TickForTime(time.Duration(f.Period * float64(time.Second)))

		for i := startTick; i < endTick; i++ {
			s[i] += f.Amplitude * (0.5 + 0.5*math.Sin(-0.5*math.Pi+2*math.Pi*float64(i-startTick)/float64(period)))
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

		for i := range s {
			delta := (cfg.TimeForTick(i).Seconds() - b)
			s[i] += a * math.Exp(-0.5*delta*delta/(c*c))
		}

	case "noise":
		// We generate random gaussian noise for one tick in every f.Smoothness
		// ticks and we use cosine interpolation in-between. See:
		//   https://www.cs.umd.edu/class/spring2018/cmsc425/Lects/lect12-1d-perlin.pdf
		if f.Smoothness == 0 {
			throw("invalid noise smoothness")
		}
		// We choose the standard deviation so that Amplitude is width at 1% of maximum: 2*sqrt(2*ln(100)).
		stddev := f.Amplitude / (2 * math.Sqrt(2*math.Log(100)))
		r := rand.New(rand.NewSource(int64(f.Amplitude * float64(f.Smoothness))))
		var last float64
		next := r.NormFloat64() * stddev
		for i := startTick; i < endTick; i++ {
			sinceLast := (i - startTick) % f.Smoothness
			if sinceLast == 0 {
				last = next
				next = r.NormFloat64() * stddev
				s[i] += last
				continue
			}
			alpha := float64(sinceLast) / float64(f.Smoothness)
			gAlpha := (1 - math.Cos(math.Pi*alpha)) / 2
			s[i] += (1-gAlpha)*last + gAlpha*next
		}

	default:
		throw("func type '%s' not supported", f.Type)
	}
}

func DataFromFuncDesc(cfg *Config, desc FuncDesc) Data {
	w := ZeroData(cfg)
	for _, f := range desc.Terms {
		w.AddFuncTerm(cfg, f)
	}
	return w
}

type PerNodeData []Data

func MakePerNodeData(cfg *Config, numNodes int) PerNodeData {
	res := make([]Data, numNodes)
	for i := range res {
		res[i] = ZeroData(cfg)
	}
	return res
}

func (md PerNodeData) Copy(cfg *Config) PerNodeData {
	res := make([]Data, len(md))
	for i := range res {
		res[i] = md[i].Copy(cfg)
	}
	return res
}

func (nd PerNodeData) Aggregate(cfg *Config) Data {
	return DataSum(cfg, nd...)
}
