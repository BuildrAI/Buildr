import Ajv2020 from 'ajv/dist/2020.js';

const Ajv2020Constructor: any = Ajv2020;

function schemaIdentity(schema: any): any  {
  return schema && typeof schema === 'object' && typeof schema.$id === 'string' ? schema.$id : null;
}

export function compileJsonSchemaCatalog(schemas: any, options: any = {}): any  {
  if (!Array.isArray(schemas) || schemas.length === 0) throw new Error('JSON Schema catalog must contain at least one schema.');
  const definitions = new Map<string, any>();
  for (const schema of schemas) {
    const identity = schemaIdentity(schema);
    if (!identity) throw new Error('Every registered JSON Schema must declare a non-empty $id.');
    if (definitions.has(identity)) throw new Error(`Duplicate JSON Schema identity: ${identity}`);
    definitions.set(identity, schema);
  }
  let ajv: any;
  const validators: any = new Map();
  function validatorFor(identity: any): any {
    const schema = definitions.get(identity);
    if (!schema) throw new Error(`JSON Schema is not registered: ${identity}`);
    let validator = validators.get(identity);
    if (validator) return validator;
    if (!ajv) {
      ajv = new Ajv2020Constructor({
        strict: true,
        allErrors: true,
        coerceTypes: false,
        useDefaults: false,
        removeAdditional: false,
        allowUnionTypes: true,
        ...options.ajv,
      });
      for (const definition of definitions.values()) ajv.addSchema(definition);
    }
    try {
      validator = ajv.getSchema(identity) ?? ajv.compile(schema);
      validators.set(identity, validator);
      return validator;
    } catch (error: any) {
      throw new Error(`JSON Schema compile failed for ${identity}: ${error.message}`, { cause: error });
    }
  }
  return Object.freeze({
    schemaIds: Object.freeze([...definitions.keys()]),
    validate(identity: any, value: any): any  {
      const validator = validatorFor(identity);
      const valid = validator(value);
      return Object.freeze({ valid, errors: Object.freeze(valid ? [] : structuredClone(validator.errors || [])) });
    },
  });
}
