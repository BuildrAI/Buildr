import fs from 'node:fs';

const PUBLICATION_ID = '[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?';

export function createPublicationHttpContribution(application) {
  return Object.freeze({
    id: 'publication.http',
    handle: ({ request, suffix, root, respond }) => {
      if (request.method === 'GET' && suffix === '/publications') return { status: 200, body: application.listPublications(root) };
      const detail = suffix.match(new RegExp(`^/publications/(${PUBLICATION_ID})$`));
      if (request.method === 'GET' && detail) return { status: 200, body: application.publicationDetail(root, detail[1]) };
      const asset = suffix.match(new RegExp(`^/publications/(${PUBLICATION_ID})/assets/(.+)$`));
      if (request.method === 'GET' && asset) {
        const value = application.readPublicationAsset(root, asset[1], decodeURIComponent(asset[2]));
        respond.binary(fs.readFileSync(value.file), value.contentType);
        return true;
      }
      return null;
    },
  });
}
