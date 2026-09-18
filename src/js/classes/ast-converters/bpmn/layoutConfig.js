/**
 * Константы раскладки. Вынесены из BpmnLayoutGenerator и BpmnDiGenerator,
 * чтобы не было магических чисел по коду.
 */
export const LAYOUT = Object.freeze({
  // отступы внутри ячейки сетки
  visualIndent:        12.5,

  // сдвиг содержимого пула относительно левого края
  poolElemShift:       30.0,

  // зазор вокруг шлюзов при оптимизации
  gatewayGap:          25.0,

  // пограничное событие прижимается к правому нижнему углу задачи
  boundaryRightShift:  12.5,
  boundaryBottomOffset: 18,
  boundarySize:        36,

  // вертикальный зазор между пулами в collaboration
  poolStackGap:        50.0,

  // артефакты
  dataObjectAbove:     30.0,
  dataObjectWidth:     36,
  dataObjectHeight:    50,

  dataStoreBelow:      30.0,
  dataStoreWidth:      50,
  dataStoreHeight:     50,

  textAnnotationAbove: 32.0,
  textAnnotationWidth: 100,
  textAnnotationHeight: 30,
});