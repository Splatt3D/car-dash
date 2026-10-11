// Run with: node --test tests/url-builders.test.js
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  parseLatLng,
  destinationQuery,
  googleMapsAppUrl,
  googleMapsWebUrl,
  mapsEmbedUrl,
  isYouTubeMusicUrl,
} = require('../app.js');

const decodeParam = (url, name) => new URL(url.replace('comgooglemaps://', 'https://x/')).searchParams.get(name);

test('parseLatLng accepts valid pairs and rejects everything else', () => {
  assert.deepEqual(parseLatLng('-33.9249, 18.4241'), { lat: -33.9249, lng: 18.4241 });
  assert.deepEqual(parseLatLng(' 51.5,-0.12 '), { lat: 51.5, lng: -0.12 });
  assert.equal(parseLatLng('91,0'), null);
  assert.equal(parseLatLng('0,181'), null);
  assert.equal(parseLatLng('1 Main Rd, Cape Town'), null);
  assert.equal(parseLatLng(''), null);
});

test('lat,lng destinations are normalised without spaces', () => {
  assert.equal(destinationQuery(' -33.92 , 18.42 '), '-33.92,18.42');
  assert.equal(googleMapsWebUrl('-33.92, 18.42'),
    'https://www.google.com/maps/dir/?api=1&destination=-33.92%2C18.42&travelmode=driving');
});

test('app URL encodes spaces and commas', () => {
  assert.equal(googleMapsAppUrl('1 Main Rd, Cape Town'),
    'comgooglemaps://?daddr=1%20Main%20Rd%2C%20Cape%20Town&directionsmode=driving');
});

test('special characters cannot break out of the query parameter', () => {
  const address = 'Shop 3 & 4, Unit #12, 5 Long St';
  for (const url of [googleMapsAppUrl(address), googleMapsWebUrl(address)]) {
    assert.ok(!url.includes(' ') && !url.includes('#'), url);
    assert.equal(decodeParam(url, url.startsWith('comgooglemaps') ? 'daddr' : 'destination'), address);
  }
  assert.equal(decodeParam(googleMapsWebUrl(address), 'travelmode'), 'driving');
});

test('unicode addresses round-trip', () => {
  const address = "Rue de l'Église 5, Genève";
  const url = googleMapsWebUrl(address);
  assert.ok(url.includes('%C3%89glise'), url);
  assert.equal(decodeParam(url, 'destination'), address);
  assert.equal(decodeParam(googleMapsAppUrl('東京都渋谷区'), 'daddr'), '東京都渋谷区');
});

test('embed URL uses view mode with the key and centre', () => {
  assert.equal(mapsEmbedUrl('abc 123', { lat: -33.92, lng: 18.42 }),
    'https://www.google.com/maps/embed/v1/view?key=abc%20123&center=-33.92,18.42&zoom=15');
});

test('only https music.youtube.com links are accepted', () => {
  assert.ok(isYouTubeMusicUrl('https://music.youtube.com/playlist?list=LM'));
  assert.ok(!isYouTubeMusicUrl('http://music.youtube.com/'));
  assert.ok(!isYouTubeMusicUrl('https://www.youtube.com/watch?v=x'));
  assert.ok(!isYouTubeMusicUrl('https://music.youtube.com.evil.example/'));
  assert.ok(!isYouTubeMusicUrl('not a url'));
});
