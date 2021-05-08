// Copyright 2020 The Cockroach Authors.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.txt.
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0, included in the file
// licenses/APL.txt.

package main

import "time"

type Config struct {
	Timeframe time.Duration
	Tick      time.Duration

	RatePerSec   float64
	InitialBurst float64
	MaxBurst     float64
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
	Timeframe: 30 * time.Second,
	Tick:      10 * time.Millisecond,

	RatePerSec:   5000,
	InitialBurst: 50000,
	MaxBurst:     50000,
}
