// Stub for @protobufjs/inquire to avoid webpack "Critical dependency" warning.
// The original uses eval() to dynamically require modules, which triggers bundler warnings.
// Since we only use JSON serializers (not protobuf), this stub safely returns null.
function inquire(_moduleName: string): null {
  return null;
}

export = inquire;
