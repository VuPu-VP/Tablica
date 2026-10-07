import { memo } from 'react';
import type { ImageObj, Page } from '../db/types';
import { useBlobUrl } from '../import/blobs';

const PageImage = memo(function PageImage({ img, scale }: { img: ImageObj; scale: number }) {
  const url = useBlobUrl(img.blobId);
  const style = { left: img.x * scale, top: img.y * scale, width: img.w * scale, height: img.h * scale };
  return url ? (
    <img className="page-image" src={url} alt="" draggable={false} style={style} />
  ) : (
    <div className="page-image missing" style={style}>obraz czeka na synchronizację</div>
  );
});

/** Zdjęcia na stronie (pod tekstem i pismem). Zaznacza się je i przesuwa lassem. */
export function ImageLayer({ images, scale }: { images: ImageObj[]; scale: number }) {
  return (
    <div className="image-layer">
      {images.map((img) => <PageImage key={img.id} img={img} scale={scale} />)}
    </div>
  );
}

/** Tło ze slajdu/strony PDF – dopasowane do szerokości kartki, wyrównane do góry. */
export function PdfBackground({ pdf }: { pdf: NonNullable<Page['pdf']> }) {
  const url = useBlobUrl(pdf.blobId);
  if (!url) return null;
  return <div className="pdf-bg" style={{ backgroundImage: `url(${url})` }} />;
}
