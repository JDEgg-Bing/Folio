# DOCX export dependency notice

DOCX equation conversion uses mathml2omml 0.5.0 by Johannes Wilm, licensed under LGPL-3.0-or-later.

Upstream: https://github.com/fiduswriter/mathml2omml

The standard locked build uses the unmodified library. Its original package and source maps are included in resources/mathml2omml. resources/release-resources includes both LGPL v3 and GPL v3 texts, extracted original source files, and a complete upstream source archive at npm 0.5.0 gitHead 0ddeb8b59ff1a97796b25d8f682dfb410febde1d, including its build configuration. A source manifest records hashes. The bundled entities 6.0.0 code and its MIT text are also provided. The application's source removes KaTeX's source annotation before conversion and preserves XML entities through the public disableDecode option.

To replace or modify this library, install the editor's dependencies, replace node_modules/mathml2omml with a compatible version, then run npm run package. The webpack configuration and build scripts are in the editor repository. This rebuild links the editor against the replacement library; the library remains independently available in the packaged resources. The editor places no restriction on debugging modifications to this library.

For a same-version local modification, edit dist/index.js or rebuild the upstream source archive with its package.json and rollup.config.js, then package Folio and compile its installer. Do not rerun setup after your modification: locked installation restores upstream code. For a different version, update the dependency and lockfile, the source archive/provenance and license notices. Include your modifications' preferred source and describe your changes when distributing a modified library. No signing key or online service is required to run the rebuilt Folio application. See [development steps](DEVELOPMENT.md).

Folio's own code is MIT; this does not change the library's LGPL-3.0-or-later terms. The source archive is distributed under its upstream licenses, not Folio's MIT. License text sources: [LGPL v3](https://www.gnu.org/licenses/lgpl-3.0.html), [GPL v3](https://www.gnu.org/licenses/gpl-3.0.html).

Other new production dependencies: fflate 0.8.3 (MIT) for ZIP packaging; image-size 2.0.4 (MIT) for image dimensions. Their upstream repositories and licenses are included in their npm packages. The existing KaTeX dependency continues to render and validate LaTeX.
