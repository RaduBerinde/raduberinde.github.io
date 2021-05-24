package lib

import (
	"math"
	"math/rand"
)

type globalBucket struct {
	currTokens float64
	sharesSum  float64
}

func (gb *globalBucket) init(cfg *Config) {
	gb.currTokens = cfg.InitialBurst
}

func (gb *globalBucket) tick(cfg *Config, now int) {
	// If we have more than MaxBurst, then the initial burst was larger and we
	// are still using it.
	if gb.currTokens < cfg.MaxBurst {
		gb.currTokens += cfg.RatePerSec * cfg.Tick.Seconds()
		if gb.currTokens > cfg.MaxBurst {
			gb.currTokens = cfg.MaxBurst
		}
	}
}

func (gb *globalBucket) updateRate(
	cfg *Config, prevShares float64, shares float64, refilledTokens float64, currTokens float64,
) (allowedRate float64, tokens float64) {
	gb.currTokens -= refilledTokens
	gb.currTokens += currTokens
	gb.sharesSum = gb.sharesSum - prevShares + shares

	availableRate := cfg.RatePerSec
	//jif gb.currTokens < 0 {
	//j	// We have a debt to pay. Say that we want to pay it over the next
	//j	// RefillPeriod. But use at most 90% for the debt.
	//j	debtRate := -gb.currTokens / cfg.TargetRefillPeriod.Seconds()
	//j	availableRate -= debtRate
	//j	availableRate = math.Max(availableRate, 0.1*cfg.RatePerSec)
	//j}
	// Give out a proportional share of the global rate (even if it is larger than
	// the arrival rate).
	allowedRate = availableRate * shares / gb.sharesSum
	tokens = 0
	//if gb.currTokens > cfg.RatePerSec*cfg.TargetRefillPeriod.Seconds() {
	//	// Distribute some tokens.
	//	// TODO(radu): don't give out too many tokens at once.
	//	tokens = (gb.currTokens - cfg.RatePerSec*cfg.TargetRefillPeriod.Seconds()) * shares / gb.sharesSum
	//	gb.currTokens -= tokens
	//}
	return allowedRate, tokens
}

type localBucket struct {
	requested Data
	expTable  Data

	outstanding     Data
	outstandingTick int
	granted         Data
	currTokens      float64
	currRatePerTick float64
	lastShares      float64
	lastUpdateTick  int

	reqEWMA float64

	nextUpdateTick int

	r *rand.Rand
}

func (l *localBucket) init(cfg *Config, requested Data, nodeIdx int) {
	l.requested = requested
	l.outstanding = requested.Copy(cfg)
	l.granted = ZeroData(cfg)
	l.expTable = ZeroData(cfg)
	for i := range l.expTable {
		//l.expTable[i] = math.Exp(cfg.TimeForTick(i).Seconds() / 10)
		l.expTable[i] = math.Exp(cfg.TimeForTick(i).Seconds() / cfg.TargetRefillPeriod.Seconds())
	}
	l.r = rand.New(rand.NewSource(int64(nodeIdx)))
}

func (l *localBucket) maintain(cfg *Config, gb *globalBucket, now int) {
	alpha := math.Pow(0.5, cfg.Tick.Seconds())
	l.reqEWMA = l.reqEWMA*alpha + l.requested[now]*(1-alpha)
	ticksSinceUpdate := now - l.lastUpdateTick
	if now == 0 {
		ticksSinceUpdate = 1
	}
	if now >= l.nextUpdateTick {
		// Calculate arrival rate since last update and use that as the estimation
		// for the future required rate.
		// TODO(radu): this should be a moving average.
		var sum float64
		for i := now - ticksSinceUpdate + 1; i <= now; i++ {
			sum += l.requested[i]
		}
		shares := sum / cfg.TimeForTick(ticksSinceUpdate).Seconds()
		shares = l.reqEWMA

		// Now take into account the queued work that wasn't granted yet. The
		// requests are weighed exponentially by age, so that nodes progress through
		// their backlog at approximately the same rate.
		var queued float64
		for i := l.outstandingTick; i <= now; i++ {
			queued += l.outstanding[i] * l.expTable[now-i] // */ math.Exp(cfg.TimeForTick(now-i).Seconds()/10)
		}
		shares += queued //* 10000

		// Add a small "baseline" value so we never send a zero rate.
		shares += 0.1
		//if need := 1000 - l.currTokens; need > 0 {
		//	shares += need
		//}
		currRate, newTokens := gb.updateRate(cfg, l.lastShares, shares, l.currRatePerTick*float64(now-l.lastUpdateTick), l.currTokens)
		l.currTokens = newTokens
		l.lastShares = shares
		l.lastUpdateTick = now
		l.currRatePerTick = currRate * cfg.Tick.Seconds()

		randDeviation := l.r.NormFloat64() * 0.2
		randDeviation = math.Max(randDeviation, -0.5)
		l.nextUpdateTick = now + int(float64(cfg.TickForTime(cfg.TargetRefillPeriod))*(1+randDeviation))
	}
}

func (l *localBucket) request(cfg *Config, now int, amount float64) float64 {
	if l.currTokens > amount {
		l.currTokens -= amount
		return amount
	}
	available := l.currTokens
	l.currTokens = 0
	return available
}

func (l *localBucket) tick(cfg *Config, gb *globalBucket, now int) {
	l.maintain(cfg, gb, now)
	l.currTokens += l.currRatePerTick
	for l.outstandingTick <= now {
		amount := l.outstanding[l.outstandingTick]
		if amount == 0 {
			l.outstandingTick++
			continue
		}
		granted := l.request(cfg, now, amount)
		l.granted[now] += granted
		l.outstanding[l.outstandingTick] -= granted
		if granted < amount {
			return
		}
	}
}

func DistTokenBucket2(cfg *Config, requested PerNodeData) (granted PerNodeData, globalTokens Data) {
	globalTokens = ZeroData(cfg)
	granted = MakePerNodeData(cfg, len(requested))
	if len(requested) == 0 {
		return granted, globalTokens
	}

	// Make copies of requested, since we are going to modify the data.
	requested = requested.Copy(cfg)

	tickDuration := cfg.Tick.Seconds()
	// Convert from rate to absolute amount.
	for i := range requested {
		requested[i].Scale(tickDuration)
	}

	var global globalBucket
	global.init(cfg)

	local := make([]localBucket, len(requested))
	for i := range local {
		local[i].init(cfg, requested[i], i)
	}

	for now := range globalTokens {
		global.tick(cfg, now)
		globalTokens[now] = global.currTokens

		for n := range local {
			local[n].tick(cfg, &global, now)
		}
	}
	for i := range granted {
		granted[i] = local[i].granted
	}

	// Convert from absolute amount to rate.
	for i := range granted {
		granted[i].Scale(1.0 / tickDuration)
	}
	return granted, globalTokens
}
