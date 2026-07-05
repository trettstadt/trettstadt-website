---
title: This website (trettstadt.de)
description: Portfolio website built with Astro, deployed with Pulumi and Github Actions 
date: 2026-06-28
demoURL: https://trettstadt.de
repoURL: https://github.com/trettstadt/trettstadt-website
---

```mermaid
flowchart LR
    gh[GitHub Actions\nCI/CD Pipeline] -->|docker push| ghcr[GHCR\nContainer Registry]
    ghcr -->|docker compose pull| hetzner[Hetzner CX23\nnbg1, Debian 13]
    pulumi[Pulumi IaC\nJava] -.->|provisions| hetzner
    hetzner --> caddy[Caddy\nTLS / Let's Encrypt]
    caddy -->|reverse proxy| astro[Astro\nNginx / Static Site]
    user[Visitor] -->|HTTPS :443| caddy
``` 

The goal was to build a fast and simple website that can basically deployed anywhere. I chose Astro because it builds a static site and there is no need for a database. Also all changes are versioned in Git.
Pushing to the repo builds a Docker image and triggers an update on the server. On the server we run the website container and a Caddy container as proxy that also handles TLS including getting certificates from Let's Encrypt. The server is a small Hetzner cloud server located in Germany. 