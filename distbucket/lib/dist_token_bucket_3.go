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

// request a bunch of tokens; the result is a (possibly smaller) amount of
// tokens and a deadline meaning that the tokens should be distributed over time
// until the deadline.
func (gb *globalBucket) request(
	cfg *Config, now int, prevShares float64, shares float64, tokens float64,
) (grantedTokens float64, deadlineTick int) {
	if tokens < 0 {
		panic("requested negative tokens")
	}
	gb.sharesSum = gb.sharesSum - prevShares + shares

	if gb.currTokens >= tokens {
		gb.currTokens -= tokens
		return tokens, now
	}

	if gb.currTokens > 0 {
		grantedTokens = gb.currTokens
		tokens -= gb.currTokens
	}

	availableRate := cfg.RatePerSec
	if gb.currTokens < 0 {
		debt := -gb.currTokens
		// We pre-distribute what we receive over the next TargetRefillPeriod; any
		// debt over that is a systematic error we need to account for.

		debt -= cfg.TargetRefillPeriod.Seconds() * cfg.RatePerSec
		if debt > 0 {
			// Say that we want to pay the debt over the next RefillPeriod (but use at
			// most 90% of the rate for the debt).
			debtRate := debt / cfg.TargetRefillPeriod.Seconds()
			availableRate -= debtRate
			availableRate = math.Max(availableRate, 0.01*cfg.RatePerSec)
		}
	}
	// Give out a proportional share of the global rate (even if it is larger than
	// the arrival rate).
	allowedRate := availableRate * shares / gb.sharesSum
	allowedRate = math.Max(allowedRate, 0.001)

	allowedRatePerTick := allowedRate * cfg.Tick.Seconds()

	// Calculate how many ticks we need to accumulate the necessary amount.
	ticks := int(tokens/allowedRatePerTick + 0.5)
	//fmt.Printf("allowedRate: %v  allowedRatePerTick: %v  ticks: %v\n", allowedRate, allowedRatePerTick, ticks)
	maxTicks := cfg.TickForTime(cfg.TargetRefillPeriod)
	if ticks < 0 {
		panic("FOO")
	}
	if ticks <= maxTicks {
		grantedTokens += tokens
		deadlineTick = now + ticks
	} else {
		// We don't want to plan ahead for more than the target period; give out
		// fewer tokens.
		grantedTokens += allowedRatePerTick * float64(maxTicks)
		deadlineTick = now + maxTicks
	}

	gb.currTokens -= grantedTokens
	return grantedTokens, deadlineTick
}

type localBucket struct {
	requested Data
	expTable  Data

	outstanding      Data
	outstandingTick  int
	granted          Data
	currTokens       float64
	currRatePerTick  float64
	deadlineTick     int
	lastShares       float64
	lastRefillTick   int
	lastRefillAmount float64

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
		l.expTable[i] = math.Exp(float64(cfg.TimeForTick(i)) / float64(cfg.QueuedTimeScale))
	}
	l.r = rand.New(rand.NewSource(int64(nodeIdx)))
}

func (l *localBucket) distribute(now int, amount float64, deadlineTick int) {
	l.lastRefillTick = now
	l.lastRefillAmount = amount
	if deadlineTick < now {
		panic("deadlineTick < now")
	}
	if deadlineTick <= now {
		l.deadlineTick = now
		l.currTokens += amount
		l.currRatePerTick = 0
		return
	}
	// Add up the remaining tokens from the last refill.
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

	alpha := math.Pow(cfg.EWMAFactor, cfg.Tick.Seconds())
	l.reqEWMA = l.reqEWMA*alpha + l.requested[now]*(1-alpha)

	// Calculate refill amount.
	var amount float64
	if l.lastRefillAmount == 0 {
		// Initial request.
		amount = 1000
	} else {
		amount = l.reqEWMA * float64(cfg.TargetRefillPeriod.Seconds()/cfg.Tick.Seconds())
		//timeSinceRefill := cfg.TimeForTick(now) - cfg.TimeForTick(l.lastRefillTick)
		//amount = l.grantedSinceLastRefill / float64(timeSinceRefill) * float64(cfg.TargetRefillPeriod)

		//// Estimate TargetRefillPeriod more seconds of requests.
		//lastTick := now - cfg.TickForTime(cfg.TargetRefillPeriod)
		//if lastTick < 0 {
		//	lastTick = 0
		//}
		//for i := lastTick; i < now; i++ {
		//	amount += l.requested[i]
		//}

		// Add the queued work that has not been granted yet.
		for i := l.outstandingTick; i <= now; i++ {
			amount += l.outstanding[i]
		}

		amount = math.Max(amount, cfg.MinRefillAmount)
		amount = math.Min(amount, cfg.MaxRefillAmount)
	}

	// Calculate the amount of shares. We start with a small baseline so we never
	// send a zero rate.
	shares := 1e-10
	// Add the EWMA of requested RUs per tick as an estimate of the load.
	shares += l.reqEWMA

	// Now take into account the queued work that wasn't granted yet. The
	// requests are weighed exponentially by age, so that nodes progress through
	// their backlog at approximately the same rate.
	var queued float64
	for i := l.outstandingTick; i <= now; i++ {
		queued += l.outstanding[i] * l.expTable[now-i] // */ math.Exp(cfg.TimeForTick(now-i).Seconds()/10)
	}
	shares += queued * 1e-2 //1e-5

	granted, deadlineTick := gb.request(cfg, now, l.lastShares, shares, amount)
	l.lastShares = shares
	// TODO(radu): simulate RTT.
	l.distribute(now, granted, deadlineTick)
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
	if l.deadlineTick >= now {
		l.currTokens += l.currRatePerTick
	}
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

func DistTokenBucket3(cfg *Config, requested PerNodeData) (granted PerNodeData, globalTokens Data) {
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
