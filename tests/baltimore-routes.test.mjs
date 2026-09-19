import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORY_LABELS } from '../lib/analysis-labels.ts';
import {
  B311_REPORT_URL,
  ELECTRICITY_HIGH_SERIOUSNESS,
  EXTREME_SERIOUSNESS,
  agencyReportLink,
  agencyReportingCopy,
  handoffsForCategory,
  isEmergencyHandoff,
  likelyDepartmentName,
  primaryHandoff,
  telHref,
} from '../lib/baltimore-routes.ts';

test('isEmergencyHandoff treats fire/injury as emergency regardless of score', () => {
  assert.equal(isEmergencyHandoff('fire_injury_or_immediate_threat', null), true);
  assert.equal(isEmergencyHandoff('fire_injury_or_immediate_threat', 1), true);
});

test('isEmergencyHandoff uses extreme seriousness for any category', () => {
  assert.equal(isEmergencyHandoff('roads_and_sidewalks', EXTREME_SERIOUSNESS), true);
  assert.equal(isEmergencyHandoff('roads_and_sidewalks', EXTREME_SERIOUSNESS - 1), false);
  assert.equal(isEmergencyHandoff('trash_and_sanitation', null), false);
});

test('isEmergencyHandoff treats high-scoring electricity and gas as emergency', () => {
  assert.equal(isEmergencyHandoff('electricity_and_gas', ELECTRICITY_HIGH_SERIOUSNESS), true);
  assert.equal(isEmergencyHandoff('electricity_and_gas', ELECTRICITY_HIGH_SERIOUSNESS - 1), false);
  assert.equal(isEmergencyHandoff('electricity_and_gas', null), false);
});

test('routine categories expose a primary department with 311 fallback', () => {
  const trash = handoffsForCategory('trash_and_sanitation');
  assert.equal(trash[0].id, 'dpw-solid');
  assert.equal(trash[0].phones?.[0]?.number, '410-396-5134');
  assert.equal(trash.at(-1)?.id, 'b311');
  assert.deepEqual(
    trash.find((link) => link.id === 'b311')?.phones?.map((p) => p.number),
    ['311', '443-263-2220'],
  );
  assert.equal(trash[0].reportUrl, B311_REPORT_URL);
  assert.equal(agencyReportLink('trash_and_sanitation').href, B311_REPORT_URL);

  const water = handoffsForCategory('water_drainage_and_sewage');
  assert.equal(water[0].id, 'dpw-water');
  assert.equal(water[0].phones?.[1]?.number, '410-396-5352');

  const roads = handoffsForCategory('roads_and_sidewalks');
  assert.equal(roads[0].department, 'Baltimore City Department of Transportation');
  assert.equal(likelyDepartmentName('roads_and_sidewalks'), roads[0].department);
});

test('electricity maps to BGE first and 311 fallback without always listing 911', () => {
  const links = handoffsForCategory('electricity_and_gas');
  assert.equal(links[0].id, 'bge');
  assert.equal(links.some((link) => link.id === '911'), false);
  assert.equal(links.some((link) => link.id === 'b311'), true);
  assert.equal(primaryHandoff('electricity_and_gas', 3).id, 'bge');
  assert.equal(primaryHandoff('electricity_and_gas', 9).id, '911');
});

test('fire category leads with 911 and keeps department follow-up', () => {
  const links = handoffsForCategory('fire_injury_or_immediate_threat');
  assert.equal(links[0].id, '911');
  assert.equal(links[0].href, 'tel:911');
  assert.equal(primaryHandoff('fire_injury_or_immediate_threat', 2).id, '911');
  assert.equal(likelyDepartmentName('fire_injury_or_immediate_threat'), 'Baltimore City Fire Department');
});

test('telHref builds dialable hrefs for short codes and local numbers', () => {
  assert.equal(telHref('911'), 'tel:911');
  assert.equal(telHref('311'), 'tel:311');
  assert.equal(telHref('410-396-5352'), 'tel:4103965352');
});

test('each category maps to an https public report URL', () => {
  for (const category of Object.keys(CATEGORY_LABELS)) {
    const link = agencyReportLink(category);
    assert.match(link.href, /^https:\/\//, category);
    assert.equal(link.href.startsWith('tel:'), false, category);
  }
  assert.equal(agencyReportLink('roads_and_sidewalks').id, 'bcdot');
  assert.equal(agencyReportLink('roads_and_sidewalks').href, B311_REPORT_URL);
  assert.equal(agencyReportLink('electricity_and_gas').id, 'bge');
  assert.equal(agencyReportLink('electricity_and_gas').href, 'https://secure.bge.com/powerOutages/');
  assert.equal(agencyReportLink('fire_injury_or_immediate_threat').id, 'bcfd');
  assert.equal(agencyReportLink('fire_injury_or_immediate_threat').href, B311_REPORT_URL);
  assert.equal(handoffsForCategory('fire_injury_or_immediate_threat').find((l) => l.id === 'bpd')?.reportUrl, 'https://www.baltimorepolice.org/file-police-report');
});

test('analysis reporting chip uses catalog agency names and reporting, not report', () => {
  const roads = agencyReportingCopy('roads_and_sidewalks');
  assert.equal(roads.href, B311_REPORT_URL);
  assert.equal(roads.label, 'Open Baltimore City Department of Transportation reporting');
  assert.equal(/ report$/.test(roads.label), false);
  const fire = agencyReportingCopy('fire_injury_or_immediate_threat');
  assert.equal(fire.label, 'Open Baltimore City Fire Department reporting');
  assert.match(fire.href, /^https:\/\//);
});

test('handoff copy stays informational and never claims a city filing', () => {
  const forbidden =
    /submitted to (the )?city|sent to (the )?city|we (have )?submitted|open311|send it yourself|file this yourself|does not send reports to 311 for you/i;
  for (const category of [
    'roads_and_sidewalks',
    'trash_and_sanitation',
    'electricity_and_gas',
    'fire_injury_or_immediate_threat',
  ]) {
    for (const link of handoffsForCategory(category)) {
      assert.equal(forbidden.test(link.note ?? ''), false, `${category} ${link.id}`);
    }
  }
});
