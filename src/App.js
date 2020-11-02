import React, { useEffect, useState, useCallback, useRef } from "react";
import Ajv from "ajv";
import { JsonEditor } from "jsoneditor-react";
import JSONEditor from "jsoneditor/dist/jsoneditor-minimalist";
import "jsoneditor-react/es/editor.min.css";
import ace from "brace";
import "brace/mode/json";
import "brace/theme/github";
import draft4 from "ajv/lib/refs/json-schema-draft-04.json";
import { diff } from "jsondiffpatch";

const schema_url =
  "https://sandbox.zenodo.org/api/schemas/deposits/records/legacyrecord.json";
const ajv = new Ajv({ schemaId: "id", verbose: true });
ajv.addMetaSchema(draft4);

// TODO: Remove once JSONSchema "enums" are fixed in production
function patchSchema(data) {
  data.properties.upload_type.enum = data.properties.upload_type.type.enum;
  data.properties.upload_type.type = "string";
  data.properties.publication_type.enum =
    data.properties.publication_type.type.enum;
  data.properties.publication_type.type = "string";
  data.properties.image_type.enum = data.properties.image_type.type.enum;
  data.properties.image_type.type = "string";
  return data;
}

const validateLicense = (id) => {
  return new Promise((resolve, reject) => {
    fetch(`https://sandbox.zenodo.org/api/licenses/${id}`)
      .then((res) => resolve(res.ok))
      .catch((err) => reject(err));
  });
};

const validateGrant = (id) => {
  return new Promise((resolve, reject) => {
    var grantUrl = null;
    if (/^\d+$/.test(id)) {
      grantUrl = `https://sandbox.zenodo.org/api/grants/10.13039/501100000780::${id}`;
    } else {
      grantUrl = `https://sandbox.zenodo.org/api/grants/${id}`;
    }

    fetch(grantUrl)
      .then((res) => resolve(res.ok))
      .catch((err) => reject(err));
  });
};

const validateCommunity = (id) => {
  return new Promise((resolve, reject) => {
    fetch(`https://sandbox.zenodo.org/api/communities/${id}`)
      .then((res) => resolve(res.ok))
      .catch((err) => reject(err));
  });
};

const sample = {
  title: "Software title v1",
  creators: [{ name: "Alex" }],
};

class MyEditor extends JsonEditor {
  createEditor({ value, text, ...rest }) {
    if (this.jsonEditor) {
      this.jsonEditor.destroy();
    }

    this.jsonEditor = new JSONEditor(this.htmlElementRef, {
      onChange: this.handleChange,
      ...rest,
    });
    if (value) {
      this.jsonEditor.set(value);
    } else if (text) {
      this.jsonEditor.setText(text);
    }
  }
}

function isObject(o) {
  return typeof o === "object" && o !== null;
}

function Editor({ schema, metadata, onChange }) {
  const onValidate = (json) => {
    var delta = diff(metadata, json);
    var promises = [];
    if (delta && delta.license) {
      promises.push(
        validateLicense(json.license).then((valid) => {
          if (!valid) {
            return {
              path: ["license"],
              message: `Invalid license ${json.license}.`,
            };
          } else {
            return null;
          }
        })
      );
    }
    if (delta && delta.grants) {
      json.grants.forEach((g, idx) => {
        if (g.id) {
          promises.push(
            validateGrant(g.id).then((valid) => {
              if (!valid) {
                return {
                  path: ["grants", idx, "id"],
                  message: `Invalid grant ID ${g.id}.`,
                };
              } else {
                return null;
              }
            })
          );
        }
      });
    }
    if (delta && delta.communities) {
      json.communities.forEach((c, idx) => {
        let community_id = c.identifier;
        if (community_id) {
          promises.push(
            validateCommunity(community_id).then((valid) => {
              if (!valid) {
                return {
                  path: ["communities", idx, "identifier"],
                  message: `Invalid community ID ${community_id}.`,
                };
              } else {
                return null;
              }
            })
          );
        }
      });
    }
    return Promise.all(promises).then((errors) => {
      return errors.filter((error) => {
        return error != null;
      });
    });
  };
  return (
    <>
      <MyEditor
        value={isObject(metadata) ? metadata : null}
        text={!isObject(metadata) ? metadata : null}
        onChange={onChange}
        allowedModes={["tree", "code", "form"]}
        ajv={ajv}
        schema={schema}
        ace={ace}
        mode={"code"}
        onValidate={onValidate}
      />
    </>
  );
}

function App() {
  const [schema, setSchema] = useState(false);
  const [metadata, setMetadata] = useState(null);

  useEffect(() => {
    const fetchSchema = async () => {
      const res = await fetch(schema_url);
      const json = await res.json();
      setSchema(patchSchema(json));
    };
    setMetadata(sample);
    fetchSchema();
  }, []);

  const onChange = (e) => {
    // setMetadata(e);
  };

  return (
    <>
      {schema && metadata ? (
        <Editor schema={schema} metadata={metadata} onChange={onChange} />
      ) : (
        <p>Loading schema...</p>
      )}
    </>
  );
}

export default App;
