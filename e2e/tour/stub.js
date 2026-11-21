// Maestro runScript helper for ios_dark_full_tour.yaml: calls the local tour stub
// (e2e/tour/stub-server.mjs). Env: STUB_URL, ACTION (e.g. "mark?name=start", "payments-on").
// Never fails the tour: without the stub the paywall step simply stays hidden.
try {
  const res = http.get(STUB_URL + '/__tour/' + ACTION);
  output.stub = res.ok ? 'ok' : 'status ' + res.status;
} catch (e) {
  output.stub = 'unreachable';
}
console.log('tour stub ' + ACTION + ': ' + output.stub);
