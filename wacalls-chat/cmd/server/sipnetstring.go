package main

import (
	"bufio"
	"fmt"
	"io"
	"strconv"
)

// Netstring framing (djb's "netstrings": "<length>:<payload>,"), used by
// baresip's ctrl_tcp module for every command/response/event message. See
// https://github.com/baresip/baresip/blob/main/modules/ctrl_tcp/ctrl_tcp.c
// (it includes "tcp_netstring.h" and wraps the connection with
// netstring_insert). This is NOT plain newline-delimited JSON — a naive
// line-based reader would hang forever waiting for a '\n' that never comes.

// writeNetstring encodes payload as a netstring and writes it to w.
func writeNetstring(w io.Writer, payload []byte) error {
	_, err := fmt.Fprintf(w, "%d:", len(payload))
	if err != nil {
		return err
	}
	if _, err := w.Write(payload); err != nil {
		return err
	}
	_, err = w.Write([]byte{','})
	return err
}

// readNetstring reads exactly one netstring-framed payload from r (a
// buffered reader, since we need ReadByte). Returns io.EOF (or a wrapped
// error) when the connection closes mid-frame.
func readNetstring(r *bufio.Reader) ([]byte, error) {
	// Length prefix: ASCII digits up to ':'. baresip caps this in practice
	// (its own send-side length is bounded by mbuf sizes), so 10 digits
	// (up to ~9.9GB) is a generous, still-safe upper bound against a
	// misbehaving peer sending an unbounded digit stream.
	lenBuf := make([]byte, 0, 10)
	for {
		b, err := r.ReadByte()
		if err != nil {
			return nil, err
		}
		if b == ':' {
			break
		}
		if b < '0' || b > '9' {
			return nil, fmt.Errorf("sip ctrl: invalid netstring length byte %q", b)
		}
		lenBuf = append(lenBuf, b)
		if len(lenBuf) > 10 {
			return nil, fmt.Errorf("sip ctrl: netstring length prefix too long")
		}
	}
	n, err := strconv.Atoi(string(lenBuf))
	if err != nil {
		return nil, fmt.Errorf("sip ctrl: invalid netstring length %q: %w", lenBuf, err)
	}
	payload := make([]byte, n)
	if _, err := io.ReadFull(r, payload); err != nil {
		return nil, err
	}
	trailer, err := r.ReadByte()
	if err != nil {
		return nil, err
	}
	if trailer != ',' {
		return nil, fmt.Errorf("sip ctrl: netstring missing trailing comma (got %q)", trailer)
	}
	return payload, nil
}
