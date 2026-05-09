import time

METRICS = [
    {"type": "docker_cpu", "label": "Docker CPU", "unit": "%", "color": "#6750a4"},
    {"type": "docker_ram", "label": "Docker RAM", "unit": "MB", "color": "#3b82f6"},
]

_client = None
last_error: str = ""


def _ensure_client():
    global _client, last_error
    if _client is not None:
        return _client
    try:
        import docker
        _client = docker.from_env()
        _client.ping()  # actually test the connection
        last_error = ""
        return _client
    except Exception as e:
        last_error = str(e)
        return None


def collect() -> list:
    client = _ensure_client()
    if client is None:
        return []

    rows = []
    ts = int(time.time())
    try:
        for c in client.containers.list():
            try:
                stats = c.stats(stream=False)
                cpu_delta = (
                    stats['cpu_stats']['cpu_usage']['total_usage']
                    - stats['precpu_stats']['cpu_usage']['total_usage']
                )
                system_delta = (
                    stats['cpu_stats'].get('system_cpu_usage', 0)
                    - stats['precpu_stats'].get('system_cpu_usage', 0)
                )
                n_cpus = (
                    stats['cpu_stats'].get('online_cpus')
                    or len(stats['cpu_stats']['cpu_usage'].get('percpu_usage') or [1])
                )
                cpu_pct = (cpu_delta / system_delta * n_cpus * 100.0) if system_delta > 0 else 0.0

                mem = stats.get('memory_stats', {})
                ram_mb = (mem.get('usage', 0) - mem.get('stats', {}).get('cache', 0)) / 1_048_576

                rows.append((ts, 'docker_cpu', round(cpu_pct, 2), '%', c.name))
                rows.append((ts, 'docker_ram', round(ram_mb, 2), 'MB', c.name))
            except Exception as e:
                print(f"[containers] Error collecting stats for {c.name}: {e}")
                pass
    except Exception as e:
        global _client
        last_error = str(e)
        _client = None  # reset so we reconnect next time

    return rows
