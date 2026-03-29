# 0K

0K can connect directly to GitHub, open a downloaded website, or access the rest of the internet via WebRTC.

It does all of this at absolute zero: 0K is distributed in static, frozen form.

## Using sites from the web

0K needs you to run your own tunnel to access the rest of the internet. Don't worry - it's easy, and it's what makes 0K free and reliable.

<details><summary>Run a tunnel on your personal computer</summary>

TODO

</details>

<details><summary>Run a tunnel on your personal Android device</summary>

TODO

</details>

<details><summary>Run a tunnel on your personal browser</summary>

TODO

</details>

<details><summary>Run a tunnel on CodeHS</summary>

TODO

</details>

<details><summary>Run a tunnel on GitHub Codespaces</summary>

TODO

</details>


## The zen of 0K / 0K from first principles

Every proxy site faces two problems: hosting itself, and tunneling traffic.

**Hosting.**

Custom domains cost money, effort, and get blocked anyway.

Dynamic hosting on shared domains is mostly already blocked, and expensive.

Static hosting on shared domains is durable - blocking it means blocking CDNs or tools for students to code.

**Tunneling.**

There's a trend to use static hosting on shared domains, but still tunnel through a custom domain.

These tunnels cost money, effort, and could be blocked if filters started respecting the PSL or detecting AI-generated placeholders.

Everybody has a personal device.  
Everybody can reach Google AMP.  
Therefore, 0K's tunnels run over personal devices, with handshakes over AMP.  
So 0K is 100% shared domains.

## Credits

- Adrift: inspiration for using WebRTC
- Snowfort: inspiration for using Google Amp
- Night Network: inspiration for building to SVG and hosting on jsDelivr
- Various skids: inspiration for suggesting hosting on Techsmart and Google Cloud Storage
