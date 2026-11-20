import { defineConverter } from '../contract.js';
import { ProtobufRenderer } from './renderer.js';

export const protobufConverter = defineConverter({
  id: 'protobuf',
  names: ['proto', 'protobuf', 'прото'],
  title: 'Protobuf',
  description: 'AST → Protobuf-схема.',
  renderer: ProtobufRenderer,
});
