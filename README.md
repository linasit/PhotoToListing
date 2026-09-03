# PhotoToListing

PhotoToListing is a Lithuanian-language marketplace app that turns a product photo into an editable listing draft. OpenAI analyzes the image and suggests a title, description, category, condition, and price. The corrected listing can then be published to a shared feed backed by Vercel Blob.

Live app: [photo-to-listing.vercel.app](https://photo-to-listing.vercel.app/)

## Features

- AI image analysis and Lithuanian listing copy
- Editable title, description, category, condition, and price
- Shared public listing feed
- Secure editing for listings created in the same browser
- JPG, PNG, WebP, and HEIC upload support
- Responsive Next.js interface

## Requirements

- [Node.js](https://nodejs.org/) 22.13 or newer
- An [OpenAI API key](https://platform.openai.com/api-keys)
- A [Vercel account](https://vercel.com/) with a Blob store

## Run locally

1. Clone the repository and enter the project directory:

   ```bash
   git clone https://github.com/linasit/PhotoToListing.git
   cd PhotoToListing
   ```

2. Install the dependencies:

   ```bash
   npm install
   ```

3. Create `.env.local` in the project root:

   ```dotenv
   OPENAI_API_KEY=your_openai_api_key
   BLOB_READ_WRITE_TOKEN=your_vercel_blob_read_write_token
   ```

   You can also copy the included template first:

   ```bash
   cp .env.example .env.local
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

Do not commit `.env.local` or expose either secret in client-side code.

## Production build

To verify and run a production build locally:

```bash
npm run build
npm run start
```

The app will be available at [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

1. Import this GitHub repository into Vercel.
2. Create or connect a Vercel Blob store to the project.
3. Add `OPENAI_API_KEY` to the project environment variables.
4. Confirm that the Blob integration added `BLOB_READ_WRITE_TOKEN`.
5. Deploy the project.

Vercel automatically detects the Next.js configuration. Future pushes to the production branch will trigger new deployments.

You can also configure and deploy from the command line:

```bash
npx vercel link
npx vercel env pull .env.local
npx vercel --prod
```

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm run start` | Run the production build |
| `npm run lint` | Run Oxlint |
| `npm run format` | Format the code with Oxfmt |

## How listing editing works

When a listing is published, the API returns a one-time edit token. The browser stores that token locally, while only its SHA-256 hash is saved with the listing record. Public feed responses never expose the token or its hash. As a result, a listing can be edited only from the browser that originally published it.

Listings created before secure editing was introduced do not have an edit token and cannot be edited through the current interface.

## Tech stack

- Next.js 16 and React 19
- TypeScript
- Tailwind CSS
- OpenAI Responses API with image input
- Vercel Blob
