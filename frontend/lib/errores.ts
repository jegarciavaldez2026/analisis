/**
 * Mensaje legible a partir de un error de axios.
 *
 * Existe por un fallo concreto y reproducido: el botón de Favoritos metía
 * `error.response.data.detail` directamente en un `<Text>`. Con un 404 o un 400
 * de FastAPI eso funciona, porque `detail` es una cadena. Con un **422** no:
 * FastAPI devuelve ahí un ARRAY de objetos de Pydantic
 *
 *     [{ type, loc, msg, input, url }]
 *
 * y React no sabe pintar un objeto. Lanza el error #31 y la pantalla entera se
 * queda en blanco. O sea: un campo mal enviado no daba un aviso, tumbaba la
 * aplicación.
 *
 * La lección es la que este proyecto ya tiene escrita para los mapeos de
 * campos: **un campo declarado por un tercero no es un dato verificado**. Aquí
 * no cambia la unidad, cambia el TIPO —cadena o lista de objetos— según el
 * código de estado, y nada en la firma lo advierte.
 *
 * Esta función devuelve SIEMPRE una cadena. Nunca `undefined`, nunca un objeto.
 */

/** Un renglón de error de Pydantic, tal y como viaja en un 422. */
interface DetallePydantic {
  loc?: (string | number)[];
  msg?: string;
  type?: string;
}

function esDetallePydantic(x: any): x is DetallePydantic {
  return x != null && typeof x === 'object' && typeof x.msg === 'string';
}

/**
 * @param e        lo que sea que haya capturado el `catch`
 * @param respaldo mensaje cuando no se puede extraer nada mejor
 */
export function mensajeDeError(e: any, respaldo = 'Algo ha fallado'): string {
  const detalle = e?.response?.data?.detail;

  // Caso normal: FastAPI con `raise HTTPException(detail="…")`.
  if (typeof detalle === 'string' && detalle.trim()) return detalle;

  // Caso 422: lista de errores de validación. Se nombra el campo, porque
  // «Field required» a secas no dice cuál y obliga a abrir la consola.
  if (Array.isArray(detalle)) {
    const partes = detalle.filter(esDetallePydantic).map((d) => {
      // `loc` es ['body', 'campo']; el primer segmento es el sitio, no el campo.
      const campo = Array.isArray(d.loc) ? d.loc.filter((s) => s !== 'body').join('.') : '';
      return campo ? `${campo}: ${d.msg}` : String(d.msg);
    });
    if (partes.length) return partes.join(' · ');
  }

  // Un objeto suelto en `detail`: se busca algo legible antes de rendirse.
  if (esDetallePydantic(detalle)) return detalle.msg as string;

  if (typeof e?.message === 'string' && e.message.trim()) return e.message;

  return respaldo;
}
