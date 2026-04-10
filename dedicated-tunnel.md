# How to run a dedicated 0K tunnel

## Decide on a tunnel code

You can actually use a domain as a tunnel code. All you need to do on your domain is publish the hash of your proof (this makes sure your domain always points to your tunnel). For example:

```
pnpx @0k-web/server --proof tlpuufbfahtrnahresonwyhclh --code bigrat.monster
[0k server] Tunnel code: bigrat.monster
[0k server] Proof: tlpuufbfahtrnahresonwyhclh
[0k server] Publish this at https://bigrat.monster/0k-hash: 1603b4b6712f75a9b7576acb3b0acb0061420386b12aac4ae3bb400cc1b03ab5
[0k server] Waiting for offers for tunnel code "bigrat.monster".
```

Alternatively, you can just use a fixed proof to make sure your tunnel code is also fixed. Your proof is like a password, so keep it safe.

## Run your tunnel

If you want a Dockerfile, this is it:

```dockerfile
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
ADD https://github.com/0k-web/0k/releases/latest/download/tunnel-0k-linux-x64 /usr/local/bin/0k-server
RUN chmod +x /usr/local/bin/0k-server
ENTRYPOINT ["0k-server", "--proof", "[INSERT YOUR PROOF HERE]", "--code", "[INSERT YOUR TUNNEL CODE HERE]"]
```

But remember, 0K can run anywhere. Your `0k-hash` could be hosted on GitHub Pages and your tunnel could be running on a Raspberry Pi.

## Stay safe

If you would take a precaution when hosting a Tor exit node, take the same precaution when running a public 0K tunnel.
