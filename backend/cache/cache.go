package cache

import (
	"sync"
	"time"
)

const TTL = 5 * time.Minute

type entry struct {
	value     interface{}
	expiresAt time.Time
}

type Cache struct {
	mu      sync.RWMutex
	entries map[string]*entry
}

// GlobalCache is the singleton used by handlers and ingestion scripts.
var GlobalCache = New()

func New() *Cache {
	return &Cache{entries: make(map[string]*entry)}
}

func (c *Cache) Set(key string, value interface{}) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries[key] = &entry{value: value, expiresAt: time.Now().Add(TTL)}
}

func (c *Cache) get(key string) (interface{}, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	e, ok := c.entries[key]
	if !ok {
		return nil, false
	}
	return e.value, true
}

// Get returns a cached value only when present AND still within its TTL. It is
// the read used for cases (like LLM response caching) that must never serve a
// stale value — unlike GetOrFetch, a miss returns (nil, false) rather than
// triggering a fetch.
func (c *Cache) Get(key string) (interface{}, bool) {
	if c.isExpired(key) {
		return nil, false
	}
	return c.get(key)
}

func (c *Cache) isExpired(key string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	e, ok := c.entries[key]
	if !ok {
		return true
	}
	return time.Now().After(e.expiresAt)
}

// GetOrFetch returns a cached value if still fresh.
// If the TTL has elapsed it calls fetch() for a new value.
// If fetch() fails but a stale value exists, the stale value is returned
// (last-known-good graceful degradation) and no error is propagated.
func (c *Cache) GetOrFetch(key string, fetch func() (interface{}, error)) (interface{}, error) {
	if !c.isExpired(key) {
		v, _ := c.get(key)
		return v, nil
	}

	v, err := fetch()
	if err != nil {
		if stale, ok := c.get(key); ok {
			return stale, nil
		}
		return nil, err
	}

	c.Set(key, v)
	return v, nil
}

// Invalidate removes a key so the next call forces a fresh fetch.
func (c *Cache) Invalidate(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.entries, key)
}
