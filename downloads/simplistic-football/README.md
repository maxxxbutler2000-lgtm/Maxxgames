# Simplistic Football

A single-page Three.js football game that can be hosted as a static website.

## Play Locally

```sh
npm start
```

Then open:

```text
http://127.0.0.1:4281/
```

## Publish The Website

This project is ready for static hosting. Deploy the whole folder with `index.html` at the root.

### Netlify

1. Go to Netlify.
2. Create a new site.
3. Drag this project folder into the deploy screen.
4. Netlify will publish the site and give you a public URL.

### Vercel

1. Create a new Vercel project.
2. Import this folder or a GitHub repo containing it.
3. Use the default static site settings.
4. Deploy.

### GitHub Pages

1. Create a GitHub repository.
2. Upload these files with `index.html` at the repository root.
3. In the repository settings, enable Pages from the main branch.

## Notes

The game currently loads Three.js r160 from `https://unpkg.com/three@0.160.0/build/three.module.js`, so the public site needs internet access to that CDN.
