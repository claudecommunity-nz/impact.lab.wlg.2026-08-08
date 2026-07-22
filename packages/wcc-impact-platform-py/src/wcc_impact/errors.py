"""Single error type for the whole helper library (CONTRACTS.md §7)."""


class HackPlatformError(RuntimeError):
    """Raised by every wcc_impact function on failure, with a readable message.

    Example:
        try:
            publish_signal(module_id="team-x", title="...", signal_type="outage",
                           source_type="official")
        except HackPlatformError as e:
            print(f"publish failed: {e}")
    """
