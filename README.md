# [Launch 0K](https://cdn.jsdelivr.net/gh/abndnce/b0k@main/jsdelivr/index.svg) ([esm.sh](https://raw.esm.sh/gh/abndnce/b0k@main/esm.sh/index.html), [IPFS 1](https://ipfs.io/ipns/k51qzi5uqu5dgn54ka0d91se4ytmy9uiend9pk4zfuwroenqhwllm05hzwuac6/)/[2](https://k51qzi5uqu5dgn54ka0d91se4ytmy9uiend9pk4zfuwroenqhwllm05hzwuac6.ipns.dweb.link/), [self host](https://abndnce.github.io/#other))
<!-- https://cdn.statically.io/gh/abndnce/b0k@main/jsdelivr/index.svg -->

0K can connect directly to GitHub, open a downloaded website, or access the rest of the internet via WebRTC.

It does all of this at absolute zero: 0K is distributed in static, frozen (heh) form.

## The zen of 0K / 0K from first principles

Every site like 0K faces two problems: hosting itself, and tunneling traffic.

**Hosting.**

Custom domains cost money, effort, and get blocked anyway.

Dynamic hosting on shared domains is mostly already blocked, and expensive.

Static hosting on shared domains is durable - blocking it means blocking CDNs or tools for students to code.

**Tunneling.**

There's a trend to use static hosting on shared domains, but still tunnel through a custom domain.

These tunnels cost money, effort, and could be blocked if filters started respecting the PSL or detecting AI-generated placeholders.

If 0K can reach shared domains, it can reach the internet: reaching a CDN = reaching GitHub websites, and reaching Google AMP = reaching through a tunnel to the rest of the internet.

## Download 0K's tunnel

[Windows](https://github.com/abndnce/0k/releases/download/latest/tunnel-0k-windows-x64.exe)

[Mac](https://github.com/abndnce/0k/releases/download/latest/tunnel-0k-mac-arm64) (or [Intel Mac](https://github.com/abndnce/0k/releases/download/latest/tunnel-0k-mac-x64))

[Linux](https://github.com/abndnce/0k/releases/download/latest/tunnel-0k-linux-x64) (or [ARM Linux](https://github.com/abndnce/0k/releases/download/latest/tunnel-0k-linux-arm64))

## Credits

- Adrift: inspiration for using WebRTC
- Snowfort: inspiration for using Google AMP
- Night Network: inspiration for building to SVG and hosting on jsDelivr
- Various skids: inspiration for suggesting hosting on Techsmart and Google Cloud Storage
