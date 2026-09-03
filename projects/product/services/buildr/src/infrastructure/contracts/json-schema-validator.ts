import Ajv2020 from 'ajv/dist/2020.js';

const Ajv2020Constructor: any = Ajv2020;

function schemaIdentity(schema: any): any  {
  return schema && typeof schema === 'object' && typeof schema.$id === 'string' ? schema.$id : null;
}

export function compileJsonSchemaCatalog(schemas: any, options: any = {}): any  {
  if (!Array.isArray(schemas) || schemas.length === 0) throw new Error('JSON Schema catalog must contain at least one schema.');
  const ajv = new Ajv2020Constructor({
    strict: true,
    allErrors: true,
    coerceTypes: false,
    useDefaults: false,
    removeAdditional: false,
    allowUnionTypes: true,
    ...options.ajv,
  });
  const validators: any = new Map();
  for (const schema of schemas) {
    const identity = schemaIdentity(schema);
    if (!identity) throw new Error('Every registered JSON Schema must declare a non-empty $id.');
    if (validators.has(identity)) throw new Error(`Duplicate JSON Schema identity: ${identity}`);
    try {
      validators.set(identity, ajv.compile(schema));
    } catch (error: any) {
      throw new Error(`JSON Schema compile failed for ${identity}: ${error.message}`, { cause: error });
    }
  }
  return Object.freeze({
    schemaIds: Object.freeze([...validators.keys()]),
    validate(identity: any, value: any): any  {
      const validator = validators.get(identity);
      if (!validator) throw new Error(`JSON Schema is not registered: ${identity}`);
      const valid = validator(value);
      return Object.freeze({ valid, errors: Object.freeze(valid ? [] : structuredClone(validator.errors || [])) });
    },
  });
}
