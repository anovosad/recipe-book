package middleware

import (
	"net"
	"net/http"
	"testing"
	"time"
)

func mustNets(t *testing.T, cidrs ...string) []*net.IPNet {
	t.Helper()
	var nets []*net.IPNet
	for _, c := range cidrs {
		_, n, err := net.ParseCIDR(c)
		if err != nil {
			t.Fatalf("bad CIDR %q: %v", c, err)
		}
		nets = append(nets, n)
	}
	return nets
}

func withTrustedProxies(t *testing.T, nets []*net.IPNet) {
	t.Helper()
	previous := trustedProxies
	trustedProxies = nets
	t.Cleanup(func() { trustedProxies = previous })
}

func TestClientIPIgnoresHeadersFromUntrustedPeers(t *testing.T) {
	withTrustedProxies(t, mustNets(t, "10.0.0.0/8"))

	r, _ := http.NewRequest("GET", "/api/recipes", nil)
	r.RemoteAddr = "203.0.113.7:51234"
	r.Header.Set("X-Forwarded-For", "1.2.3.4")
	r.Header.Set("X-Real-IP", "5.6.7.8")

	if got := ClientIP(r); got != "203.0.113.7" {
		t.Fatalf("a client that is not a trusted proxy chose its own rate limit key: got %q", got)
	}
}

func TestClientIPTakesTheEntryOurProxyAppended(t *testing.T) {
	withTrustedProxies(t, mustNets(t, "10.0.0.0/8"))

	r, _ := http.NewRequest("GET", "/api/recipes", nil)
	r.RemoteAddr = "10.0.0.2:51234"
	// nginx uses $proxy_add_x_forwarded_for, so anything the client sent stays on
	// the left and the address nginx saw is appended on the right.
	r.Header.Set("X-Forwarded-For", "1.2.3.4, 198.51.100.9")

	if got := ClientIP(r); got != "198.51.100.9" {
		t.Fatalf("expected the address our own proxy appended, got %q", got)
	}
}

func TestClientIPSkipsChainedTrustedProxies(t *testing.T) {
	withTrustedProxies(t, mustNets(t, "10.0.0.0/8"))

	r, _ := http.NewRequest("GET", "/api/recipes", nil)
	r.RemoteAddr = "10.0.0.2:51234"
	r.Header.Set("X-Forwarded-For", "198.51.100.9, 10.0.0.5")

	if got := ClientIP(r); got != "198.51.100.9" {
		t.Fatalf("expected the first non-proxy address from the right, got %q", got)
	}
}

func TestClientIPFallsBackToXRealIP(t *testing.T) {
	withTrustedProxies(t, mustNets(t, "10.0.0.0/8"))

	r, _ := http.NewRequest("GET", "/api/recipes", nil)
	r.RemoteAddr = "10.0.0.2:51234"
	r.Header.Set("X-Real-IP", "198.51.100.9")

	if got := ClientIP(r); got != "198.51.100.9" {
		t.Fatalf("expected the X-Real-IP value from a trusted proxy, got %q", got)
	}
}

func TestOneBurstOfDeniedRequestsCountsAsOneViolation(t *testing.T) {
	sm := &SecurityManager{
		blockedIPs: make(map[string]time.Time),
		violations: make(map[string]*violationRecord),
	}

	// A page load that overruns the burst produces many denials in the same
	// moment. They must not add up to a block on their own.
	for i := 0; i < violationsBeforeBlock*4; i++ {
		sm.handleRateViolation("198.51.100.9", "general", time.Minute)
	}

	if blocked, _ := sm.isBlocked("198.51.100.9"); blocked {
		t.Fatal("a single burst of denied requests blocked the IP")
	}

	record := sm.violations["198.51.100.9"]
	if record == nil || record.count != 1 {
		t.Fatalf("expected the burst to count once, got %+v", record)
	}
}

func TestRepeatedViolationsStillBlock(t *testing.T) {
	sm := &SecurityManager{
		blockedIPs: make(map[string]time.Time),
		violations: make(map[string]*violationRecord),
	}

	for i := 0; i < violationsBeforeBlock; i++ {
		sm.handleRateViolation("198.51.100.9", "general", time.Minute)
		// Pretend the cooldown has passed: a client that keeps coming back after
		// being told to slow down is exactly what the block is for.
		if record := sm.violations["198.51.100.9"]; record != nil {
			record.lastCount = record.lastCount.Add(-violationCooldown - time.Second)
		}
	}

	if blocked, _ := sm.isBlocked("198.51.100.9"); !blocked {
		t.Fatal("repeated violations over time did not block the IP")
	}
}
