# Backend Code Style

Source: [Google JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html) and the [Node.js project style guide](https://github.com/nodejs/node/blob/main/doc/contributing/maintaining/maintaining-nodejs.md#style-guides).

- Use strict mode and CommonJS consistently.
- Use two-space indentation, semicolons, and single quotes.
- Keep parsing, persistence, HTTP handling, and process startup in separate modules.
- Validate all external input and return consistent JSON error responses.
- Never evaluate user input as JavaScript code.
- Use descriptive names and keep functions focused on one responsibility.
