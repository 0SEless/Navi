import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const mockUser = { id: 'mock-super-admin', name: 'Dr. Admin', email: 'admin@asu.edu', role: 'super_admin', campus_id: null };
  await page.context().addCookies([{ name: 'navi-mock-session', value: Buffer.from(JSON.stringify(mockUser)).toString('base64'), domain: 'localhost', path: '/' }]);

  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(function(m) {
    var gs = { id: m, campusId: m, version: '1.0.0', updatedAt: new Date().toISOString(), buildings: [{ id: 'bldg-test-001', name: 'Test Building', campusId: m, floors: [0], footprint: [{ lat: 11.8192, lng: 122.0918 }, { lat: 11.8195, lng: 122.0918 }, { lat: 11.8195, lng: 122.0922 }, { lat: 11.8192, lng: 122.0922 }], baseElevation: 0, height: 15, color: '#1C6BEB' }], nodes: [], edges: [], components: [] };
    localStorage.setItem('navi-graph-' + m, JSON.stringify(gs));
  }, 'test-campus');

  await page.goto('http://localhost:3000/studio/test-campus/edit', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);

  // Execute rename via dispatcher
  var result = await page.evaluate(function() {
    function findServices(f, depth) {
      if (!f || depth > 500) return null;
      try {
        var mp = f.memoizedProps;
        if (mp && mp.value && typeof mp.value === 'object' && mp.value.services && mp.value.document) return mp.value;
      } catch(e) {}
      var r = findServices(f.child, depth + 1);
      if (r) return r;
      return findServices(f.sibling, depth + 1);
    }

    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      var k = Object.keys(walker.currentNode).find(function(k) { return k.startsWith('__reactFiber$'); });
      if (k) {
        var ctx = findServices(walker.currentNode[k], 0);
        if (ctx) {
          var history = ctx.services.get('history');
          var dispatcher = ctx.services.get('dispatcher');
          var workflow = ctx.services.get('workflow');
          
          // Check history BEFORE command
          var result = {
            historyProtoKeys: Object.getOwnPropertyNames(Object.getPrototypeOf(history)),
            hasCanUndo: typeof history.canUndo === 'function',
            isDirtyBefore: workflow ? workflow.isDirty() : 'no-workflow',
            hasIsDirty: workflow ? typeof workflow.isDirty : 'no-workflow',
          };
          
          dispatcher.execute({ id: 'entity.update', label: 'Rename', payload: { entityId: 'bldg-test-001', changes: { name: 'Renamed Campus' } } });
          
          result.isDirtyAfter = workflow ? workflow.isDirty() : 'no-workflow';
          result.canUndoAfter = history.canUndo();
          
          return result;
        }
      }
    }
    return 'not-found';
  });
  console.log('Result:', JSON.stringify(result, null, 2));

  await page.waitForTimeout(500);
  var btns = await page.evaluate(function() {
    return Array.from(document.querySelectorAll('button')).map(function(b) { return { text: b.textContent.trim(), disabled: b.disabled }; });
  });
  console.log('Buttons:', JSON.stringify(btns.filter(function(b) { return ['Undo', 'Redo', 'Save', 'Save*'].includes(b.text); })));

  await browser.close();
}

main().catch(function(e) { console.error('Error:', e.message); process.exit(1); });
