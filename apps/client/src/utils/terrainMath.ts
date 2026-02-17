export const getExactHeight = (wx: number, wz: number, chunks: Record<string, any[]>) => {
  const getVertexHeight = (gx: number, gz: number) => {
    const cx = Math.floor(gx / 8);
    const cz = Math.floor(gz / 8);
    const chunkId = `${cx}_${cz}`;
    const chunk = chunks[chunkId];
    
    if (!chunk) return 0;
    
    const lx = gx % 8;
    const lz = gz % 8;
    const safeLx = lx < 0 ? lx + 8 : lx;
    const safeLz = lz < 0 ? lz + 8 : lz;
    
    return chunk[(safeLz * 8) + safeLx].height;
  };

  const gridX = wx + 0.5;
  const gridZ = wz + 0.5;
  const ix = Math.floor(gridX);
  const iz = Math.floor(gridZ);
  
  const fx = gridX - ix;
  const fz = gridZ - iz;

  const nw = getVertexHeight(ix, iz);
  const ne = getVertexHeight(ix + 1, iz);
  const sw = getVertexHeight(ix, iz + 1);
  const se = getVertexHeight(ix + 1, iz + 1);

  if (fx + fz <= 1) {
    return nw + fx * (ne - nw) + fz * (sw - nw);
  } else {
    return se + (1 - fx) * (sw - se) + (1 - fz) * (ne - se);
  }
};