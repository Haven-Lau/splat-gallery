# Splat Viewer

A small static web page that shows a Gaussian splat (2DGS / 3DGS) and lets you
orbit around it. It runs on GitHub Pages: plain HTML and JavaScript, no server
code and no build step.

- Mouse: drag to orbit, scroll to zoom, right-drag to pan.
- Touch: one finger to orbit, pinch to zoom, two fingers to pan.

It uses the same renderer as trainctl's viewer: the Spark fork from
`real-ty/spark` (with 2DGS surfels and the per-splat `beta` kernel) and
three.js r180. Both are copied into `vendor/`, so nothing is loaded from a CDN.

## Files

    index.html        the viewer page
    js/viewer.js      loading, decoding and orbit controls
    css/style.css
    splats/           the splat files (.bgsz)
    vendor/three/     three.js r180 + OrbitControls (MIT, LICENSE inside)
    vendor/spark/     Spark build from real-ty/spark/dist (MIT, LICENSE inside;
                      it bundles fflate, MIT, LICENSE.fflate)

## View it locally

    cd splat-gallery
    python -m http.server 8000

Then open http://localhost:8000/ (it shows `splats/mundo.bgsz`).
Opening `index.html` straight from disk does not work; browsers block the
module and file loads on `file://`.

## Add a splat

Splats are stored as `.bgsz`, the compressed format from
`real-ty/2DGS_hybrid/compress_splat.py` (about 6x smaller than the PLY; it
keeps `beta`). It only needs numpy, so any python with numpy works, for
example `~/miniconda3/envs/2dgs/bin/python`:

    python ~/code/real-ty/2DGS_hybrid/compress_splat.py \
        path/to/point_cloud.ply -o splats/myscene.bgsz

Then open `index.html?s=myscene.bgsz`. A `.ply` in `splats/` also works but is
much bigger (and `*.ply` is in `.gitignore`).

The page starts a new file with trainctl's default turn and an automatic
view. If the model lies on its side, add an entry for it to `VIEWS` at the
top of `js/viewer.js` with the scene's `up` direction (the mean up vector of
the cameras in the model's `cameras.json`, which is what trainctl uses).

Keep each file well under 50 MB: GitHub warns above 50 MB and refuses files
above 100 MB. Git LFS is not an option here, because GitHub Pages does not
serve LFS files.

`splats/mundo.bgsz` is `2DGS_hybrid/output/mundo_sparse2_best/best/point_cloud/
iteration_11000/point_cloud_crop.ply` (445,404 splats, 110.5 MB) compressed to
17.0 MB.

## Publish on GitHub Pages

Create an empty repo on GitHub (no README), then:

    git remote add origin git@github.com:<user>/<repo>.git
    git push -u origin main

On GitHub: Settings > Pages > Build and deployment > Source: "Deploy from a
branch", Branch: `main`, folder `/ (root)`. The site appears at
`https://<user>.github.io/<repo>/` after a minute or two. All paths are
relative, so it works under that sub-path.

## Licence

The code in `vendor/` keeps its own MIT licences. No licence is chosen yet for
the rest of this repo (the viewer code and the splat models). Add a `LICENSE`
file when you have decided.
