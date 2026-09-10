import asyncio
import inspect
import unittest
from unittest.mock import AsyncMock, patch

from app import main
from app.services import background_worker_coordinator as coordinator


class BackendMultiInstanceSafetyTests(unittest.IsolatedAsyncioTestCase):
    def test_lease_renews_well_before_expiry(self):
        self.assertGreater(coordinator.LEASE_TTL_SECONDS, coordinator.LEASE_RENEW_SECONDS * 2)
        self.assertGreater(coordinator.LEASE_RENEW_SECONDS, coordinator.LEASE_RETRY_SECONDS)

    def test_main_starts_only_the_distributed_worker_supervisor(self):
        startup_source = inspect.getsource(main.on_startup)
        self.assertIn("background_worker_supervisor", startup_source)
        self.assertNotIn("driver_settlement_sweeper(", startup_source)
        self.assertNotIn("ride_lifecycle_sweeper_bounded(", startup_source)
        self.assertNotIn("hailing_dispatch_sweeper(", startup_source)
        self.assertNotIn("stripe_payment_reconciliation_sweeper_bounded(", startup_source)
        self.assertNotIn("communications_worker(", startup_source)

        shutdown_source = inspect.getsource(main.on_shutdown)
        self.assertIn("background_workers_stop_event.set()", shutdown_source)
        self.assertIn("await asyncio.wait_for(background_workers_task", shutdown_source)

    async def test_follower_never_starts_workers_without_lease(self):
        stop_event = asyncio.Event()
        worker = AsyncMock()

        async def stop_after_retry(event, timeout):
            event.set()
            return True

        with patch.object(
            coordinator,
            "_acquire_lease",
            new=AsyncMock(return_value=False),
        ) as acquire, patch.object(
            coordinator,
            "_wait_for_stop",
            new=AsyncMock(side_effect=stop_after_retry),
        ), patch.object(
            coordinator,
            "_worker_specs",
            return_value=[("probe", worker)],
        ):
            await coordinator.background_worker_supervisor(stop_event)

        acquire.assert_awaited_once()
        worker.assert_not_awaited()

    async def test_lease_owner_starts_one_worker_set_and_releases_cleanly(self):
        stop_event = asyncio.Event()
        started = asyncio.Event()
        stopped = asyncio.Event()

        async def worker(local_stop):
            started.set()
            try:
                await local_stop.wait()
            finally:
                stopped.set()

        async def stop_after_workers_start(event, timeout):
            await started.wait()
            event.set()
            return True

        release = AsyncMock(return_value=None)
        with patch.object(
            coordinator,
            "_acquire_lease",
            new=AsyncMock(return_value=True),
        ), patch.object(
            coordinator,
            "_release_lease",
            new=release,
        ), patch.object(
            coordinator,
            "_wait_for_stop",
            new=AsyncMock(side_effect=stop_after_workers_start),
        ), patch.object(
            coordinator,
            "_worker_specs",
            return_value=[("probe", worker)],
        ):
            await coordinator.background_worker_supervisor(stop_event)

        self.assertTrue(started.is_set())
        self.assertTrue(stopped.is_set())
        release.assert_awaited_once_with(coordinator.OWNER_ID)

    async def test_lease_loss_stops_workers_before_follower_retry(self):
        stop_event = asyncio.Event()
        started = asyncio.Event()
        stopped = asyncio.Event()
        wait_calls = 0

        async def worker(local_stop):
            started.set()
            try:
                await local_stop.wait()
            finally:
                stopped.set()

        async def renew_then_stop_retry(event, timeout):
            nonlocal wait_calls
            wait_calls += 1
            if wait_calls == 1:
                await started.wait()
                return False
            event.set()
            return True

        acquire = AsyncMock(side_effect=[True, False])
        renew = AsyncMock(return_value=False)
        release = AsyncMock(return_value=None)
        with patch.object(coordinator, "_acquire_lease", new=acquire), patch.object(
            coordinator,
            "_renew_lease",
            new=renew,
        ), patch.object(
            coordinator,
            "_release_lease",
            new=release,
        ), patch.object(
            coordinator,
            "_wait_for_stop",
            new=AsyncMock(side_effect=renew_then_stop_retry),
        ), patch.object(
            coordinator,
            "_worker_specs",
            return_value=[("probe", worker)],
        ):
            await coordinator.background_worker_supervisor(stop_event)

        self.assertTrue(started.is_set())
        self.assertTrue(stopped.is_set())
        renew.assert_awaited_once_with(coordinator.OWNER_ID)
        release.assert_awaited_once_with(coordinator.OWNER_ID)
        self.assertEqual(acquire.await_count, 1)


if __name__ == "__main__":
    unittest.main()
