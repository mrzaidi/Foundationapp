/**
 * The foundation mark, for the payment receipt.
 *
 * Inlined rather than read from public/ or fetched over HTTP: a serverless
 * function does not reliably ship the public directory, and fetching the
 * deployment through its own front door breaks the moment deployment
 * protection is switched on. A few kilobytes in the bundle buys a receipt
 * whose logo cannot go missing in production.
 */
export const LOGO_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAYAAABS3GwHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAbdElEQVR4nO3deVQUd7YH' +
  '8M5k8s57oboKupNxkpxMZl7OZJL35sWZMcuMY7ZJNBkVZWlkEdlpZBFQTCaTzAQRUMAlmxv7jogg0A2C+4a4ZHPJZlxAiSgq' +
  '7kaJSe47v+puaFpomu5fd1cV957zPcejf/q51b+69atfyWRYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFgCr/sbsn6p1C588b76' +
  'hWpl/cIlirqFWmVdequiPv2Qoi79uKIu/aKiPr1HUZ8OijpD0kySCopa48w3SQoo1hlnXv/UkCT3i1vNO7pUG/Jvk/wL3NYa' +
  '5+3+qXrLJP/syxqSNwfIP3Sp/Ae48nnDJK+D62rjzO1LRVKPa8Wci64VSce5iqRDXMWcVq5itta1fM5irjxJzZUmvXh/1dxf' +
  'Ovv/e2QXwF1u2vTfKzQZ8Yr6hbXK+oXdSs1C6E09yQJQ9Eu6Loh/cPyr+QYwyZy+lJPMNuSCa9nsWteyhHi3kvjfy0B2l7NZ' +
  'SLu2Jf/8voaMSQptRrlCs7BLqcmAviB+B+MHXRJ1KSNJ6OJKE8rdyuMnkv8rZ3ORTLnVZ/yvQpORodBknFFqjdEjfuHgTzQ0' +
  'gS6l8d1caUK2W3H8OGf7EWcB3KXUZHootJn7ldpM0AXxiwJ/WQJwJKXxupTE73MtnjUVl0iWVHLyz5SaRe4KbcYnffARv2jx' +
  'lxoyC9jSuMOuJXFBuDwapHj4mqxv+sNH/FLAzxmnJO6IvDRuEs0Fg6hLoV3ykEKbVaLUZpnAR/wSxA9G0XKFUb+Wjdj6OPse' +
  'hTbzLYU26wbiH3H4gSuJBbY45jpbHPOmLFt9j2wklZsm41dKbdZuHXy88o9E/JwhxbHAFUV/xOVH/7dsJJRSmzlFqc3sRvwO' +
  'fsIrVPzFMXzYougrXEm0j0yyVZX8H0pt5vtKbeZPiB/xc0b4e1MU/RNbFP2u5JZEozYsclFqM5uUDYYlDy578MofY9IA0boU' +
  'RQNbNHOzMi9MLpNCsc1LFMqGzFbE74SNbSLEz/GZCVxR1H4mf9b9MjGXa8OiRxTarK8RP+LnhoVfn8KZx9gi9aMyseJXarM6' +
  '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' +
  '9owY/KnewKR7PU6tAWQgu8u1NPEsXvkRv1wM+Od7d8poF1eaUI7LHrzyy4WOn28AryLqDeBWmjgJ1/y47GGEjj/VG1xSPMdT' +
  'bwDZtuSfc2UJZ/CGF9f8jIDxM/O9T8uqfO6m3wAymYwtTViK0x684WWEix9cUijs/xmsuOJZf8RRJ057GIHi5xsg2ftJuzUA' +
  '3wQl8ftwzo+jTkaI+FO899gVv64BEjzwIRfO+RmB4SeRz/eebPcGIM8E2JJZh/AJLz7kYgSEn0nxPkBs2r8B+JvhOH/c3oBP' +
  'eBmh4OcbQOUjc1hV+dzNlcQdwb09uL2BEQB+l/neX8mSk3/muAYgvwLFsa/ixjbc28M4+8o/3xvuTfaa6FD8Rk1Qi7s6cWMb' +
  '40T8Lile9LY9D7fcCqIfZotjruOWZtzVyTgBP5PideM/U70ekTmz2JLYf+J+ftzSzDgeP8jneb0uc3plq+/hiqL34sssuJ+f' +
  'cSB+lxTP3cSeTAhFlkJcUfQFfJMLX2ZhHIF/ntdFLnnqr2VCKnlx7GSuKPonfI0R3+Ri7Iifmef1E5PiMVUmxGKLot/Fd3jx' +
  'NUbGXvh1DbBIJtgi9wOF0c34Aju+w8vYB/96waz7B6sHstX3ckVRu/H0BnyBnaGI3yXFa9/9yT6MTAwlL45VcoVRX+LRJXh6' +
  'A0MD/zzPb1ySPX8hE1O55sU8whZGdeC5PXh0CWPLsifFq8PpD7tsaoKCqK/w0Co8t4ex6srvdYxN9XhUJuZic8MVbKF6N57Y' +
  'hodWMcO74d1P7XBbZ9eokkAXtkC9Ho8rxBPbGIuWPZ6blJlT5DJJVbb6HrYgYimbH/kTntI8Qo8rTLXkIZfnYsGPOm0peUG4' +
  'u7wgshu/zIL4mX7bGzwvM8meKtlIKLeCkIfZ/IiWkfxZIrzyextf+fdzqT6/kY2oylbfw+SHvyHPC7+O+EfmssclxfMav6VZ' +
  'ykueoeq/8sIeZPPDS/DKP9Lwe2lFO9+3R8lzwyeyueFf47JH+i+w35vs+ZqzvQmzkpN/Js8Nd5fnhn6Ea36J4U/xOnTvfFWQ' +
  '3Q6ulVSB7C55dtgUNjdsL97wiv+4QnmKl7vDDq2SWjErQ/9Hnh06T54T2obTHtHgP83M93r/3mTPPznbj3SqyuduNifkVTY7' +
  'tIjNDunEUafA8M/37nRJ9S68N9V7Ai5zHFBM7own2FXBsfJVIdXsyuDzOOd3/Hd4XearqsnXGJn5Hk844v8cy0y5rAj8BbMq' +
  '6HluZXAksyJ4EbMyuF6+IqhFvjzoALMi6DizPKhbvjy4Bx9yDYm/xyXdp9slzec4k6Y64JKmanFJ865n0lSLmDRVBJPq9bxk' +
  'NqlhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYcmkXP8Pb6efki56qp4AAAAASUVORK5CYII=';
