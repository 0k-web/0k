# [Launch 0K](https://cdn.jsdelivr.net/gh/0k-web/builds@main/jsdelivr/index.svg)
<!-- https://cdn.statically.io/gh/0k-web/builds@main/jsdelivr/index.svg -->

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

## Self host 0K

[Download](https://github.com/0k-web/0k/releases/download/latest/selfhost-0k.zip) 0K and host it on any static hosting service, from CodeHS and Techsmart, to Google Cloud Storage and S3, Firebase Hosting and Render Static, or even pages.gay and IPFS.

(That is via jsDelivr; [this version](https://github.com/0k-web/0k/releases/download/latest/selfhost-0k-assets-statically.zip) uses Statically, and [this version](https://github.com/0k-web/0k/releases/download/latest/selfhost-0k-assets-colocated.zip) includes assets.)

## Download 0K's tunnel

[Windows](https://github.com/0k-web/0k/releases/download/latest/tunnel-0k-windows-x64.exe)

[Mac](https://github.com/0k-web/0k/releases/download/latest/tunnel-0k-mac-arm64) (or [Intel Mac](https://github.com/0k-web/0k/releases/download/latest/tunnel-0k-mac-x64))

[Linux](https://github.com/0k-web/0k/releases/download/latest/tunnel-0k-linux-x64) (or [ARM Linux](https://github.com/0k-web/0k/releases/download/latest/tunnel-0k-linux-arm64))

## Credits

- Adrift: inspiration for using WebRTC
- Snowfort: inspiration for using Google AMP
- Night Network: inspiration for building to SVG and hosting on jsDelivr
- Various skids: inspiration for suggesting hosting on Techsmart and Google Cloud Storage
