import { Component, h } from '@monygroupcorp/microact';

class DesertScene extends Component {
  renderCaravanSVG() {
    return h('svg', {
      viewBox: '0 0 400 60',
      xmlns: 'http://www.w3.org/2000/svg',
      style: { width: '400px', height: '60px' }
    },
      // First camel with rider
      h('g', { transform: 'translate(0, 0)' },
        h('path', { d: 'M70 45 C70 38 66 32 58 28 C54 26 50 26 46 28 L42 20 C40 16 37 14 34 14 C31 14 28 16 27 20 L24 28 C18 26 12 32 10 40 C8 48 10 52 14 55 L14 58 L20 58 L20 55 L60 55 L60 58 L66 58 L66 55 C70 52 72 48 70 45 Z M30 32 C32 32 34 34 34 36 C34 38 32 40 30 40 C28 40 26 38 26 36 C26 34 28 32 30 32 Z' }),
        // Rider
        h('ellipse', { cx: '42', cy: '18', rx: '6', ry: '8' }),
        h('rect', { x: '36', y: '20', width: '12', height: '10', rx: '2' })
      ),
      // Second camel
      h('g', { transform: 'translate(90, 5)' },
        h('path', { d: 'M60 40 C60 34 56 28 50 25 C46 23 42 23 38 25 L35 18 C33 14 30 12 27 12 C24 12 21 14 20 18 L17 25 C12 23 7 28 5 35 C3 42 5 46 9 49 L9 52 L14 52 L14 49 L52 49 L52 52 L57 52 L57 49 C60 46 62 42 60 40 Z M24 28 C26 28 27 30 27 32 C27 34 26 36 24 36 C22 36 21 34 21 32 C21 30 22 28 24 28 Z' })
      ),
      // Third camel with cargo
      h('g', { transform: 'translate(170, 3)' },
        h('path', { d: 'M65 42 C65 35 61 29 53 25 C49 23 45 23 41 25 L37 17 C35 13 32 11 29 11 C26 11 23 13 22 17 L19 25 C13 23 7 29 5 37 C3 45 5 49 10 52 L10 55 L16 55 L16 52 L56 52 L56 55 L62 55 L62 52 C66 49 68 45 65 42 Z M26 29 C28 29 30 31 30 33 C30 35 28 37 26 37 C24 37 22 35 22 33 C22 31 24 29 26 29 Z' }),
        // Cargo boxes
        h('rect', { x: '32', y: '15', width: '18', height: '14', rx: '2' }),
        h('rect', { x: '35', y: '12', width: '12', height: '6', rx: '1' })
      ),
      // Fourth camel
      h('g', { transform: 'translate(260, 6)' },
        h('path', { d: 'M55 38 C55 32 51 27 44 24 C40 22 36 22 32 24 L29 17 C27 13 24 11 21 11 C18 11 15 13 14 17 L11 24 C6 22 1 27 0 34 C-2 41 0 45 4 48 L4 51 L9 51 L9 48 L47 48 L47 51 L52 51 L52 48 C55 45 57 41 55 38 Z M18 27 C20 27 21 29 21 31 C21 33 20 35 18 35 C16 35 15 33 15 31 C15 29 16 27 18 27 Z' })
      )
    );
  }

  render() {
    return h('div', { className: 'desert-scene' },
      // Sand dunes
      h('div', { className: 'dune dune-1' }),
      h('div', { className: 'dune dune-2' }),
      h('div', { className: 'dune dune-3' }),

      // Camel caravan
      h('div', { className: 'caravan' },
        this.renderCaravanSVG()
      )
    );
  }
}

export default DesertScene;
