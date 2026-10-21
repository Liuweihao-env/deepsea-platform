"""队长任务的两箱取数与温度规则回归；仅操作本进程内存。"""
import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import server


class CaptainDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.load_species_db()
        server.load_temp_db()
        server.sync_sites_from_farm()

    def setUp(self):
        self.old_sim = dict(server.FISH_SIM)
        server.FISH_SIM.update(gen_status='paused', sim_mode='normal')

    def tearDown(self):
        server.FISH_SIM.update(self.old_sim)

    def test_observation_sites_inherit_cage_species(self):
        for cage in server.FARM.all_cages():
            site = next(s for s in server.SITES if s['site_id'] == cage['site_id'])
            self.assertEqual(site.get('species'), cage['species'])
            self.assertEqual(site['kind'], 'obs')

    def test_fish_uses_ledger_and_own_volume(self):
        for cage in server.FARM.all_cages():
            row = server.fish_series(5, cage['cage_id'])[-1]
            count = server.FARM.stock_of(cage['cage_id'])
            self.assertEqual(row['fish_count'], count)
            self.assertEqual(row['fish_density'], round(count / cage['spec']['effective_volume_m3'], 1))
            self.assertEqual(row['avg_weight_g'], round(server.planned_weight(cage, row['ts']), 1))

    def test_offline_fish_keeps_cage_and_site(self):
        server.FISH_SIM['sim_mode'] = 'camera_off'
        row = server.fish_series(5, 'cage_02')[-1]
        self.assertEqual(row.get('cage_id'), 'cage_02')
        self.assertEqual(row['site_id'], 'site_03')
        self.assertIsNone(row['fish_count'])

    def test_temperature_is_species_specific_and_handles_low_temperature(self):
        rule = server.PLATFORM.rule_check({'site_id': 'site_03', 'water_temp': 28})
        self.assertEqual(rule['risk_level'], 'yellow')
        self.assertEqual(rule['alarm_type'], 'water_temp')
        self.assertEqual(server.PLATFORM.rule_check({'site_id': 'site_04', 'water_temp': 28})['risk_level'], 'red')
        low = server.PLATFORM.rule_check({'site_id': 'site_03', 'water_temp': 3})
        self.assertEqual(low['risk_level'], 'red')
        self.assertEqual(low['rule_id'], 'R-TEMP-03')
        self.assertIsNone(server.PLATFORM.rule_check({'site_id': 'site_03', 'water_temp': None}))


if __name__ == '__main__':
    unittest.main(verbosity=2)
