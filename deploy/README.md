# BRZ — judge-facing deployment

## One command

```bash
sudo bash deploy/bootstrap.sh
```

This installs the runtime, bubblewrap, cgroup v2 controllers, the systemd unit, and the Caddy
reverse proxy; generates access-control credentials; and health-checks `/healthz`.

## URL

After bootstrap, the service is reachable at `https://<host>/` behind HTTP basic auth.

## Credentials

The bootstrap script generates a password and writes it to `/etc/brz/.admin-password` (mode 0600).
It prints the path, never the secret. Read it with:

```bash
sudo cat /etc/brz/.admin-password
```
"