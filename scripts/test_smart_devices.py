# -*- coding: utf-8 -*-
"""智能设备正式台账 / 两箱归属 / 指令隔离回归；只操作本进程内存。"""
import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import server


class SmartDeviceLedgerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.load_species_db()
        server.load_temp_db()
        server.sync_sites_from_farm()

    def test_both_cages_have_same_device_types_and_chinese_names(self):
        by_cage = {}
        for cid in ('cage_01', 'cage_02'):
            devs = server.FARM.devices(cid)
            self.assertEqual(len(devs), 7, cid)
            self.assertTrue(all(d.get('device_name_cn') for d in devs), cid)
            self.assertTrue(all(d.get('cage_id') == cid for d in devs), cid)
            by_cage[cid] = sorted(d['metric'] for d in devs)
        self.assertEqual(by_cage['cage_01'], by_cage['cage_02'])

    def test_device_ids_are_unique_across_cages(self):
        ids = [d['device_id'] for d in server.FARM.devices()]
        self.assertEqual(len(ids), len(set(ids)))

    def test_pending_provenance_is_not_reported_as_verified(self):
        for d in server.FARM.devices('cage_02'):
            self.assertEqual(d['cal_status']['state'], 'unconfirmed', d['device_id'])
            self.assertEqual(d['cal_status']['label'], '待确认')

    def test_runtime_status_covers_formal_ledger(self):
        ledger = {d['device_id'] for d in server.FARM.devices()}
        runtime = {d['device_id'] for d in server.PLATFORM.devices}
        self.assertEqual(ledger, runtime)
        for d in server.PLATFORM.devices:
            self.assertEqual(d['cage_id'], server.FARM.device(d['device_id'])['cage_id'])

    def test_commands_are_cage_scoped_and_records_filter_by_cage(self):
        cmd = server.PLATFORM.send_command('feeder_02', 'feed',
                                           {'amount_kg': 1.0}, None, 'cage_02')
        self.assertEqual(cmd['cage_id'], 'cage_02')
        cage2 = server.PLATFORM.feed_records('cage_02')
        cage1 = server.PLATFORM.feed_records('cage_01')
        self.assertIn(cmd['command_id'], [r['command_id'] for r in cage2])
        self.assertNotIn(cmd['command_id'], [r['command_id'] for r in cage1])

    def test_command_target_rejects_wrong_type_and_cross_cage(self):
        self.assertEqual(server.command_target('feeder_02', 'feed')['cage_id'], 'cage_02')
        with self.assertRaises(ValueError):
            server.command_target('light_02', 'feed')
        with self.assertRaises(ValueError):
            server.command_target('feeder_02', 'feed', 'cage_01')
        with self.assertRaises(LookupError):
            server.command_target('no_such_device', 'feed')
        with self.assertRaises(ValueError):
            server.command_target('sensor_temp_02', 'feed')

    def test_feed_decision_is_cage_specific(self):
        d1 = server.feed_decision('cage_01')
        d2 = server.feed_decision('cage_02')
        self.assertEqual(d1['cage_id'], 'cage_01')
        self.assertEqual(d2['cage_id'], 'cage_02')
        self.assertEqual(d1['site_id'], 'site_04')
        self.assertEqual(d2['site_id'], 'site_03')


if __name__ == '__main__':
    unittest.main(verbosity=2)
