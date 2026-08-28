package importer

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"syscall"
	"time"
)

const (
	// A recipe page is text. 2MB is far more than any of them need and keeps a
	// hostile server from streaming until we run out of memory.
	maxPageBytes = 2 << 20
	fetchTimeout = 20 * time.Second
	maxRedirects = 3

	// Sites block empty and obviously-scripted agents, and an honest one that
	// says where the request came from is the polite way to ask.
	userAgent = "Mozilla/5.0 (compatible; recipe-book/1.0; +https://github.com/recipe-book)"
)

// Ranges that are not on the public internet and that a user-supplied URL has
// no business reaching. net.IP covers loopback, link-local, multicast and the
// RFC1918/ULA private ranges itself; these are the ones it has no predicate for.
var extraBlocked = mustParseCIDRs(
	"0.0.0.0/8",       // "this network"
	"100.64.0.0/10",   // carrier-grade NAT
	"192.0.0.0/24",    // IETF protocol assignments
	"192.0.2.0/24",    // TEST-NET-1
	"198.18.0.0/15",   // benchmarking
	"198.51.100.0/24", // TEST-NET-2
	"203.0.113.0/24",  // TEST-NET-3
	"240.0.0.0/4",     // reserved
	"::/128",          // unspecified
	"64:ff9b::/96",    // NAT64, which maps straight onto IPv4
	"2001:db8::/32",   // documentation
)

// fetchPage retrieves a page for the importer, refusing anything that is not a
// public HTTP(S) address.
//
// The URL comes from whoever is signed in, and the server is the one making the
// request - which is the definition of SSRF. The check that matters is the one
// in the dialer's Control hook: it runs after DNS resolution with the address
// actually about to be connected to, so a hostname that resolves to
// 169.254.169.254 (cloud metadata) or to something on the home LAN is refused
// even if a second lookup would have answered differently. Checking the
// hostname up front cannot do that, because the name is resolved again later.
func fetchPage(ctx context.Context, rawURL string) (body string, finalURL string, err error) {
	parsed, err := parsePublicURL(rawURL)
	if err != nil {
		return "", "", err
	}

	dialer := &net.Dialer{
		Timeout:   10 * time.Second,
		KeepAlive: 10 * time.Second,
		Control: func(network, address string, _ syscall.RawConn) error {
			host, _, splitErr := net.SplitHostPort(address)
			if splitErr != nil {
				return inputError("that address could not be read")
			}
			ip := net.ParseIP(host)
			if ip == nil || blockedIP(ip) {
				return inputError("that address is not on the public internet")
			}
			return nil
		},
	}

	client := &http.Client{
		Timeout: fetchTimeout,
		Transport: &http.Transport{
			DialContext:           dialer.DialContext,
			TLSHandshakeTimeout:   10 * time.Second,
			ResponseHeaderTimeout: 15 * time.Second,
			DisableKeepAlives:     true,
			// One page, one connection - there is no second request to reuse it.
			MaxIdleConns: 1,
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= maxRedirects {
				return inputError("that page redirects too many times")
			}
			// The dialer re-checks the address, but the scheme is ours to police:
			// a redirect to file:// or gopher:// would never reach the dialer.
			if _, redirectErr := parsePublicURL(req.URL.String()); redirectErr != nil {
				return redirectErr
			}
			return nil
		},
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return "", "", inputError("that URL could not be requested")
	}
	request.Header.Set("User-Agent", userAgent)
	request.Header.Set("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1")
	request.Header.Set("Accept-Language", "cs,sk,en;q=0.8")

	response, err := client.Do(request)
	if err != nil {
		// A refusal raised in Control or CheckRedirect arrives wrapped in a
		// *url.Error; unwrapping it keeps the reason readable instead of
		// reporting every one of them as a generic network failure.
		var urlErr *url.Error
		if errors.As(err, &urlErr) && isInputError(urlErr.Err) {
			return "", "", urlErr.Err
		}
		return "", "", inputError("that page could not be loaded")
	}
	defer response.Body.Close()

	if response.StatusCode >= 400 {
		return "", "", describeStatus(response.StatusCode)
	}

	contentType := response.Header.Get("Content-Type")
	if mediaType := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0])); mediaType != "" &&
		mediaType != "text/html" && mediaType != "application/xhtml+xml" && mediaType != "text/plain" {
		return "", "", inputError("that link is not a web page")
	}

	// LimitReader rather than MaxBytesReader: this is a response we are reading,
	// not a request body, and going over the cap is a truncation, not an error -
	// a recipe is near the top of the document anyway.
	raw, err := io.ReadAll(io.LimitReader(response.Body, maxPageBytes))
	if err != nil {
		return "", "", inputError("that page stopped sending partway through")
	}

	return string(raw), response.Request.URL.String(), nil
}

// describeStatus turns a refusal into something worth reading. The distinction
// that matters is between "this link is wrong" and "this site will not talk to
// us": a fair number of recipe sites sit behind bot protection and answer 403
// to anything that is not a browser, and the honest answer there is to say so
// rather than to leave someone re-checking a URL that is perfectly correct.
// We identify ourselves in User-Agent and take the consequences; pretending to
// be a browser to get past it is not a trade worth making.
func describeStatus(code int) error {
	switch {
	case code == 404 || code == 410:
		return inputError("there is no page at that address any more")
	case code == 401 || code == 403:
		return inputError("that site refuses automated readers, so its recipes cannot be imported")
	case code == 429:
		return inputError("that site is asking us to slow down; try again in a few minutes")
	case code >= 500:
		return inputError("that site is having trouble of its own right now")
	default:
		return inputError(fmt.Sprintf("that page answered %d", code))
	}
}

// parsePublicURL normalises a user-typed URL and rejects the schemes that have
// no business here. A bare "example.com/recipe" is accepted and read as https.
func parsePublicURL(rawURL string) (*url.URL, error) {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return nil, inputError("enter the address of a recipe page")
	}
	if !strings.Contains(rawURL, "://") {
		rawURL = "https://" + rawURL
	}

	parsed, err := url.Parse(rawURL)
	if err != nil {
		return nil, inputError("that does not look like a web address")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, inputError("only http and https addresses can be imported")
	}
	if parsed.Hostname() == "" {
		return nil, inputError("that address has no host")
	}
	// A literal IP still goes through the dialer check, but catching it here
	// gives the better message and saves a lookup.
	if ip := net.ParseIP(parsed.Hostname()); ip != nil && blockedIP(ip) {
		return nil, inputError("that address is not on the public internet")
	}
	// Credentials in a URL would be forwarded to whatever it redirects to.
	parsed.User = nil

	return parsed, nil
}

// blockedIP judges an address the dialer is about to connect to. The net.IP
// predicates all resolve an IPv4-mapped IPv6 address (::ffff:127.0.0.1) to the
// IPv4 address it carries, so that form needs no separate handling; the CIDRs
// are matched on both families for the same reason.
func blockedIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsUnspecified() || ip.IsPrivate() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsInterfaceLocalMulticast() || ip.IsMulticast() {
		return true
	}
	for _, block := range extraBlocked {
		if block.Contains(ip) {
			return true
		}
	}
	return false
}

func mustParseCIDRs(cidrs ...string) []*net.IPNet {
	blocks := make([]*net.IPNet, 0, len(cidrs))
	for _, cidr := range cidrs {
		_, block, err := net.ParseCIDR(cidr)
		if err != nil {
			panic("importer: bad CIDR " + cidr)
		}
		blocks = append(blocks, block)
	}
	return blocks
}
