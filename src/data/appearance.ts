export const BOARD_MODELS: { value: string; label: string }[] = [
  { value: '/board.glb', label: 'Flat' },
  { value: '/board-2.glb', label: 'Rounded' },
];

export const DICE_MODELS: { value: string; label: string }[] = [
  { value: '/dice.glb', label: 'Classic White' },
  { value: '/dice-2.glb', label: 'Rounded Gold' },
  { value: '/dice-3.glb', label: 'Modern Red' },
];

export const BOARD_MATERIAL_REPEAT_DEFAULT: [number, number] = [5, 5];

export const BOARD_MATERIALS: { value: string; label: string; repeat?: [number, number] }[] = [
  { value: 'blue_metal_plate_1k', label: 'Blue Metal Plate', repeat: [1, 1] },
  { value: 'concrete_tile_facade_1k', label: 'Concrete Tile Facade', repeat: [5, 5] },
  { value: 'corrugated_iron_02_1k', label: 'Corrugated Iron', repeat: [10, 10] },
  { value: 'exterior_wall_cladding_03_1k', label: 'Wall Cladding', repeat: [5, 5] },
  { value: 'green_metal_rust_1k', label: 'Metal Rust', repeat: [1, 1] },
  { value: 'interior_tiles_1k', label: 'Interior Tiles', repeat: [10, 10] },
  { value: 'old_linoleum_flooring_01_1k', label: 'Old Linoleum', repeat: [5, 5] },
  { value: 'plank_flooring_04_1k', label: 'Plank Wood', repeat: [5, 5] },
  { value: 'plastered_wall_02_1k', label: 'Shiney Plaster', repeat: [10, 10] },
  { value: 'plastered_wall_05_1k', label: 'Classic Plaster', repeat: [4, 4] },
  { value: 'rubber_tiles_1k', label: 'Rubber Grey', repeat: [6, 6] },
];
