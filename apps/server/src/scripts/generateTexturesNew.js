//
//  generateTexturesNew.js
//  
//
//  Created by Giovanni Spagnuolo on 2/17/26.
//


import fs from 'fs';
import { PNG } from 'pngjs';
import { createNoise2D } from 'simplex-noise';

const noise2D = createNoise2D();
const SIZE = 64; 

const TEXTURES = {
  grass: [[34, 70, 34], [45, 90, 39], [56, 110, 45], [68, 130, 50]],
  dirt:  [[59, 39, 22], [77, 51, 28], [94, 64, 34], [112, 77, 40]],
  sand:  [[194, 178, 128], [204, 189, 143], [214, 201, 158], [224, 213, 173]],
  water: [[20, 80, 160], [25, 100, 190], [30, 120, 220], [35, 140, 240]],
  rock:  [[80, 80, 80], [100, 100, 100], [120, 120, 120], [140, 140, 140]]
};

const generateRetroTexture = (name, colors, scale, style = 'wavy') => {
  const png = new PNG({ width: SIZE, height: SIZE });

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let n;
      
      if (style === 'grainy') {
        // 40% base patches of color, 60% high-frequency speckled static
        n = noise2D(x * scale, y * scale) * 0.4 + noise2D(x * scale * 25, y * scale * 25) * 0.8;
      } else {
        // Standard smooth wavy clouds
        n = noise2D(x * scale, y * scale) * 0.8 + noise2D(x * scale * 4, y * scale * 4) * 0.2;
      }

      let normalized = (n + 1) / 2; 
      
      // Clamp to ensure we don't accidentally pull an undefined array index
      normalized = Math.max(0, Math.min(0.99, normalized));

      const colorIndex = Math.floor(normalized * colors.length);
      const [r, g, b] = colors[colorIndex];

      const idx = (png.width * y + x) << 2;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255; 
    }
  }

  const buffer = PNG.sync.write(png);
  fs.writeFileSync(`./public/textures/${name}.png`, buffer);
  console.log(`✅ Generated /textures/${name}.png`);
};

const generateMacroNoise = () => {
  const MACRO_SIZE = 512; 
  const png = new PNG({ width: MACRO_SIZE, height: MACRO_SIZE });
  
  for (let y = 0; y < MACRO_SIZE; y++) {
    for (let x = 0; x < MACRO_SIZE; x++) {
      const n = noise2D(x * 0.01, y * 0.01);
      const val = Math.floor(((n + 1) / 2) * 255);
      
      const idx = (png.width * y + x) << 2;
      png.data[idx] = val;
      png.data[idx + 1] = val;
      png.data[idx + 2] = val;
      png.data[idx + 3] = 255;
    }
  }
  
  const buffer = PNG.sync.write(png);
  fs.writeFileSync('./public/textures/noise.png', buffer);
  console.log('✅ Generated /textures/noise.png (Macro Shader Overlay)');
};

if (!fs.existsSync('./public/textures')) {
  fs.mkdirSync('./public/textures', { recursive: true });
}

console.log("Generating N64 Textures...");
// We explicitly tell the grass to use the new speckled noise math
generateRetroTexture('grass', TEXTURES.grass, 0.05, 'grainy');
generateRetroTexture('dirt', TEXTURES.dirt, 0.08, 'grainy');
generateRetroTexture('sand', TEXTURES.sand, 0.04, 'wavy');
generateRetroTexture('water', TEXTURES.water, 0.06, 'wavy');
generateRetroTexture('rock', TEXTURES.rock, 0.1, 'grainy');

console.log("Generating Shader Maps...");
generateMacroNoise();
