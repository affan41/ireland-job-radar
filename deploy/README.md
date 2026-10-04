# Hosting OneLess

Deployment preparation only: no cloud server, account, public URL or automatic
deployment has been provisioned by these files.

## Runtime

The app runs on Node 24, with its SQLite database in the `oneless-jobs` Docker
volume. The `oneless-backups` volume stores backups made before updates. Rebuilding
or replacing the container preserves both volumes. The container starts its own
scheduled collection; do not add a second refresh cron job or run multiple app
instances against this database.

The image deliberately excludes the local database, config file, outputs and
credentials. A new server starts with a fresh collection. Transferring existing
records requires a separately reviewed export, particularly shortlist notes.

## First installation

Use an Oracle Always Free eligible Linux VM within the account's current limits.
Install Git, Docker Engine and the Compose plugin from their official packages.
Then clone this repository, enter its directory and run:

```sh
docker compose up -d --build --wait --wait-timeout 120
```

The service listens only on the server's loopback interface. For a private preview,
forward it through SSH from your own computer:

```sh
ssh -L 18099:127.0.0.1:8099 ubuntu@YOUR_SERVER_IP
```

Then open `http://localhost:18099`. The VM IP and SSH account must come from the
actual provisioned server; do not open port 8099 to the public internet.

## Before public launch

Choose the audience first. The current app uses shared shortlist/hide controls
and exposes an endpoint that starts collection. It is not a multi-user service.
For personal access, put the entire app behind HTTPS and authentication. For a
public job website, implement visitor-isolated preferences and protect the refresh
endpoint before adding a public HTTPS proxy. Those changes are not implemented by
this deployment package.

Domain/HTTPS setup and the actual hosting account are still required. A `.site`
domain is a separate registration; no domain has been purchased.

## Updates and backups

After pushing tested changes to GitHub, run this in the server checkout:

```sh
bash deploy/update.sh
```

The script rejects a dirty checkout, backs up a running database, pulls a fast-forward
update, rebuilds and waits for the app health check. It does not remove volumes.
Keep independent backups outside the VM as well; a volume cannot protect against
loss of the VM or hosting account. Database rollback requires the matching code
revision and backup, not merely an older image.

Optional API credentials can be supplied through the host environment. Careerjet
still requires a genuine end-user request context, so background collection skips
it. Avoid storing credentials in the repository.

Automatic GitHub deployment has not been enabled. Until a server and access method
are configured, the update script is a manual server command.
