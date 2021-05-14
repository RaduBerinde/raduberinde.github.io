// Copyright 2020 The Cockroach Authors.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.txt.
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0, included in the file
// licenses/APL.txt.

package lib

import "time"

type Config struct {
	Timeframe time.Duration
	Tick      time.Duration

	// Global token bucket settings.
	RatePerSec   float64 `yaml:"rate_per_sec"`
	InitialBurst float64 `yaml:"initial_burst"`
	MaxBurst     float64 `yaml:"max_burst"`

	// Algorithm knobs.
	ReqAmount      float64
	LowWatermark   float64
	PreRequestTime time.Duration

	// Misc settions.
	Smoothing bool
}

func (c Config) NumTicks() int {
	return int(c.Timeframe / c.Tick)
}

func (c Config) TimeForTick(tick int) time.Duration {
	return c.Tick * time.Duration(tick)
}

func (c Config) TickForTime(t time.Duration) int {
	return int(t / c.Tick)
}

func (c Config) TimeAxis() []float64 {
	res := make([]float64, c.NumTicks())
	for i := range res {
		res[i] = float64(c.TimeForTick(i)) / float64(time.Second)
	}
	return res
}

var DefaultConfig = Config{
	Timeframe: 60 * time.Second,
	Tick:      10 * time.Millisecond,

	RatePerSec:   240,
	InitialBurst: 100,
	MaxBurst:     100,

	ReqAmount:      1000,
	LowWatermark:   100,
	PreRequestTime: 10 * time.Second,
}
