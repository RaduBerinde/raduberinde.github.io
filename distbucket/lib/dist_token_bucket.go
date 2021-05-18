package lib

import "math"

type globalBucket struct {
	currTokens   float64
	lastDeadline int
}

func (gb *globalBucket) tick(cfg *Config, now int) {
	if gb.lastDeadline >= now {
		// We have already pre-distributed the tokens for this tick.
		return
	}
	// If we have more than MaxBurst, then the initial burst was larger and we
	// are still using it.
	if gb.currTokens < cfg.MaxBurst {
		gb.currTokens += cfg.RatePerSec * cfg.Tick.Seconds()
		if gb.currTokens > cfg.MaxBurst {
			gb.currTokens = cfg.MaxBurst
		}
	}
}

func (gb *globalBucket) request(cfg *Config, now int, amount float64) (deadlineTick int) {
	if gb.currTokens >= amount {
		if gb.lastDeadline > now {
			panic("giving out tokens with outstanding deadline")
		}
		gb.currTokens -= amount
		return now
	}
	amount -= gb.currTokens
	gb.currTokens = 0
	// Calculate how many ticks we need to accumulate the necessary amount.
	n := int(amount/(cfg.RatePerSec*cfg.Tick.Seconds()) + 0.5)
	if n < 0 {
		n = 1
	}
	if gb.lastDeadline <= now {
		gb.lastDeadline = now
	}
	gb.lastDeadline += n
	return gb.lastDeadline
}

type localBucket struct {
	requested              Data
	requestedTick          int
	granted                Data
	currTokens             float64
	currRatePerTick        float64
	deadlineTick           int
	lastRefillAmount       float64
	lastRefillTick         int
	grantedSinceLastRefill float64
}

func (l *localBucket) distribute(now int, amount float64, deadlineTick int) {
	l.grantedSinceLastRefill = 0
	l.lastRefillTick = now
	l.lastRefillAmount = amount
	if deadlineTick < now {
		panic("deadlineTick < now")
	}
	if deadlineTick < l.deadlineTick {
		panic("deadlineTick < l.deadlineTick")
	}
	if deadlineTick <= now {
		l.deadlineTick = now
		l.currTokens += amount
		l.currRatePerTick = 0
		return
	}
	// Add up the tokens that were already pre-distributed.
	if l.deadlineTick > now {
		amount += float64(l.deadlineTick-now) * l.currRatePerTick
	}
	l.deadlineTick = deadlineTick
	l.currRatePerTick = amount / float64(deadlineTick-now)
}

func (l *localBucket) maintain(cfg *Config, gb *globalBucket, now int) {
	if l.currTokens > l.lastRefillAmount*cfg.RefillFraction {
		return
	}
	if float64(l.deadlineTick-now)*cfg.Tick.Seconds() > cfg.PreRequestTime.Seconds() {
		return
	}
	// Calculate refill amount.
	var amount float64
	if l.lastRefillAmount == 0 {
		// Initial request.
		amount = 1000
	} else {
		timeSinceRefill := cfg.TimeForTick(now) - cfg.TimeForTick(l.lastRefillTick)
		amount = l.grantedSinceLastRefill / float64(timeSinceRefill) * float64(cfg.TargetRefillPeriod)
		amount = math.Max(amount, cfg.MinRefillAmount)
		amount = math.Min(amount, cfg.MaxRefillAmount)
	}

	deadlineTick := gb.request(cfg, now, amount)
	// TODO(radu): simulate RTT.
	l.distribute(now, amount, deadlineTick)
}

func (l *localBucket) request(cfg *Config, now int, amount float64) float64 {
	if l.currTokens > amount {
		l.currTokens -= amount
		l.grantedSinceLastRefill += amount
		return amount
	}
	available := l.currTokens
	l.currTokens = 0
	l.grantedSinceLastRefill += available
	return available
}

func (l *localBucket) tick(cfg *Config, gb *globalBucket, now int) {
	if l.currRatePerTick > 0 && l.deadlineTick >= now {
		l.currTokens += l.currRatePerTick
	}
	l.maintain(cfg, gb, now)
	for l.requestedTick <= now {
		amount := l.requested[l.requestedTick]
		if amount == 0 {
			l.requestedTick++
			continue
		}
		granted := l.request(cfg, now, amount)
		l.granted[now] += granted
		l.requested[l.requestedTick] -= granted
		if granted < amount {
			return
		}
	}
}

func DistTokenBucket(cfg *Config, requested PerNodeData) (granted PerNodeData, globalTokens Data) {
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
	local := make([]localBucket, len(requested))
	for i := range local {
		local[i].requested = requested[i]
		local[i].granted = ZeroData(cfg)
	}

	global.currTokens = cfg.InitialBurst

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
