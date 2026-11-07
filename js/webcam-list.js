// Hand-kept list of live airport cameras, keyed by ICAO. Only add cameras whose owner allows embedding.
// type 'youtube': { id }              -> https://www.youtube.com/embed/<id> (live streams)
// type 'iframe':  { url }             -> any embeddable page (the site must not send X-Frame-Options/frame-ancestors)
// type 'image':   { url, refresh }    -> still image reloaded every `refresh` seconds
// Every entry: { credit: 'Name', page: 'https://source page' } (shown under the player).
//
// Example:
//   LGTS: { type: 'youtube', id: 'XXXXXXXXXXX', credit: 'Example Cam', page: 'https://example.com/cam' },
export const WEBCAMS = {};
